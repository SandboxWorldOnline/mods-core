# Lights And Shadows → SandboxWorld WebGL2 移植规格(定谳文档)

权威源:`reference/`(原 mod 的 4 个 HLSL `.fx` + 反编译 `Lights.cs`/`LightsConfig.cs`
+ 3 张色带 PNG)。原版工坊件:tModLoader 2670628346,Lights v1.4.2(tML 2024.10.3.0)。

## 原版机制(反编译定谳)

挂钩 tML `FilterManager.EndCapture` 的 **MonoMod 前缀**(先于 orig=先于原版滤镜链)。
强制 `Lighting.Mode=3`(彩色光照)。原版 ColorOfTheSkies 乘法仅发生在各 Filter
Apply 绘制时(反编译 FilterManager.cs:150-210)→ **mod 所见场景未乘天色**——
移植后链输入同为未乘天色场景,mod pass 不声明 `uTint` 自然豁免链乘。

每帧管线(原版 6+N pass → 移植 7+2N-1 pass,全部 GPU):

| # | 原版 | 移植 | 分辨率 |
|---|---|---|---|
| 1 | GetShadow(场景→阴影掩码,Additive 黑底) | `las_mask` 单 pass | 1/3 |
| 2 | godray=30/20 次全屏缩放叠加绘制掩码 | `las_godray` 单 pass 径向 30/20 tap | 1/3 |
| 3 | 环境光层(全分辨率 RT,NonPremultiplied) | `las_ambient` 平滑渐变降 1/3(双线性上采样无损) | 1/3 |
| 4 | UseShadow 合成(scene += (amb−god)·ambA) | **lit 内联进 bright/final**(无中间缓冲;final 逐像素=逐位精确,bright 1/3 降采样序 ±1-2LSB 登记债) | — |
| 5 | Bloom 亮部提取 | `las_bright`(lit 内联版) | 1/3 |
| 6 | Kawase ×N ping-pong | `las_kb0/1` ×N | 1/3 |
| 7 | Blend(亮部调制加回) | `las_final`(lit 内联版) | 全 |

★2026-10-13 弱机刀:全分辨率 pass 2→**1**(final 唯一),`las_lit` 全分辨率 FBO
删除;GPU 带宽 ≈-45%。地下(ambientOn=0)光照 4 pass 全跳过=字节等价。

## 关键混合链精推(XNA 输出合并器逐级钳 [0,1] 语义)

- 环境光:`NonPremultiplied=(SrcAlpha,InvSrcAlpha)` 黑底 →
  `amb.rgb = clamp01(c.rgb·s)·clamp01(c.a·s)`,`amb.a = clamp01(c.a·s)`,s = i·intensity
  (i = (3−ls)/3,ls 按宽高比修正;两段钳——intensity<0 时全黑)
- 掩码:`Additive=(SrcAlpha,One)` 黑底 → `mask.rgb = pow(1−b, 0.75)`(b<m),
  **`mask.a = pow²`**(Additive α 通道 `dst.a += src.a·src.a` 自乘——godray 的
  pow³ 项来源;★2026-10-12 复核修正:初版误存 rgb==a=pow,阴影弱两个数量级不可见)
- godray:默认精灵着色器×顶点色,`Additive` 贡献 = `src.rgb·src.a` →
  日(color=(1,1,1,A_i)):`Σ pow(uv_i)³·A_i`;夜(Color.White·A 四通道全乘):
  `Σ pow(uv_i)³·A_i²`,uv_i = sun + (uv−sun)/scale_i
  (树冠 pow≈0.85→pow³≈0.61 vs 天空 pow≈0.3→0.027,对比 ~22:1——影子由此出)
- 合成:`scene += clamp01(amb.rgb − god.rgb)·amb.a`(**差值钳 0,不反减场景**)
- 终帧:rt1 清黑后 Blend 出全帧 → `out = clamp01(lit.rgb + bloom.rgb·m2·α)`,
  `α = clamp01(pow(1−lum2, 4.5))`,lum2 = 0.3r+0.6g+0.1b(lit 之后)
  (XNA Additive src.a = 1+m2 输出合并器钳 1 → **无放大项**)

## 状态公式(全部逐字移植自 Lights.cs)

- 强度:day `num3 = 0.8·lightIntensity·(1+num·0.4)`,num = (1−1.2·R·0.3+G·0.6+B·0.1)/255;
  雪原(非猩红非腐化)`num -= bgA[7]·0.1`;猩红 `+= 0.3`;snowBG0∈{263,258,267}
  `num -= bgA[7]`;==263 再 `-= bgA[7]·0.5`;desertBG0==248 `num -= bgA[2]·0.9`
- 月相:0(满)→1.01;3/5→0.9;4(新)→0.6
- 深度衰减(格):playerTileY > worldSurface−150 → num2·=1−d/200;num3·=1−d/600
- 太阳位:den=昼27000/夜16200;`x=(1−n3)·W/2−100·n3; y=−screenY/(worldSurface·16−600)·200+n3²·250+180`;gravDir=−1 时 y=H−y
- 环境光绘制门:playerCy_px < worldSurface·16+800(地下=无环境光层)
- 阴影阈值:day `m = 1 − bgA[2]·0.09`(desert248→m=1);night m=0.02
- godray α:day `A_i = 0.55·(30−i)/120·(shadowIntensity+0.1)·(num3·0.5−0.1)`,
  scale_i = 1+i·(1/3)·(0.014+0.03)(quality=3 同原版);night `A_j = (20−j)/190`,
  scale_j = 1+j·0.01
- 色带 t:昼 time/54000,夜 time/32400;昼 Classic=ColorTex / Alternate=ColorTex_Alt,
  夜 ColorTex2
- Bloom:阈值 `0.71−bloomIntensity·0.01`;Kawase dxy = (2.5/w, 2.5/h)
  (原 uScreenResolution=(w/2.5,h/2.5) 的倒数——跨分辨率 uv 域等价),
  uIntensity = 1+N·0.005,taps ±(d,d) 对角 4 采

## 门控语义(与原版一致)

- useLight=false:掩码/godray/环境光全跳过,bloom 直接吃场景(=原版 rt1 未加光层)
- **ambientOn=false(玩家深度 >worldSurface·16+800px):光照 4 pass 全跳过=
  字节等价**(原版数学此处贡献恒零:lightRT 黑 → (amb−god)·amb.a ≡ 0),bloom
  与终帧直接吃场景;省 4 pass(2026-10-13 trace 判读后的免费优化)
- useBloom=false:亮部提取/Kawase 跳过,终帧=lit 原样
- 两者皆关:pass 退化为直通 blit(链输出契约不变)

## 性能实证(Trace-20261012T233332,x-ray 拆解,24.7s 会话)

- 61.8fps 锁顶/主线程 53% idle/无 >33ms 帧;帧距抖动=60Hz 渲染×100Hz 合成的
  拍差,非工作量溢出
- mod CPU 足迹:execInner 含参 **0.15%**,全滤镜链(含 mod)1.2%;链税主体=
  合成档每帧整幅 texSubImage2D 上传(180ms/24s≈0.75%)+present 回贴
- GPU 侧 trace 不可见;~10 draw(6 在 1/3 分辨率)设计冗余充足
- 已知后续优化位(未落):mod-only 链帧免上传(消费引擎 GL 侧合成输出纹理——
  K1-2 stack 路的自然延伸,省上传+回贴两趟整幅);bright-pass 并入 kawase#0
  (点运算可合并,省一个 1/3 pass,奇偶账已核)

## 效率账(vs 原版 tML 实现)

- draw call:原版 ~40+/帧 → **8+N**(N=BloomCounts,默认 4)
- 全分辨率 pass:原版 4 → **2**(lit/final);godray 30 次全屏叠加 → 单 pass 30 tap
- 环境光层全分辨率 → 1/3(纯平滑渐变,双线性上采样视觉无损)
- 中间 FBO 总驻留 ≈ 1.44×全帧(原版 ≥3×全帧 RT)
- JS 每帧仅 uniform 数学与 ~10 次 draw(无 CPU 逐像素循环——按 src/wasm/README
  判据无 WASM 迁移价值;重头全部在 GPU 且已由管线重排消减)

## 移植声明面

引擎侧:hooks `registerModScreenFx`(collectModScreenFx→Renderer 7d 链前插)+
GLScreenFilters `'ModScreenFx'` pass 分支(出口契约=写 fboA,GL 朝向)。
已知边界:旧 GL 乒乓链(`?sfxgl=0`)/2D 近似回退/低清档(wK<1)路径 mod 效果缺席
(无 2D 近似——原版亦为纯 GPU mod)。
