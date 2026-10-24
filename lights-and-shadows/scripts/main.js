// Lights And Shadows v1.4.2 → SandboxWorld WebGL2 移植(2026-10-12)。
// 权威源 = reference/(原 mod HLSL .fx + 反编译 Lights.cs);公式逐字移植,
// 混合链精推与偏差表见 PORTING.md。引擎挂钩面 = hooks.registerModScreenFx
// (Renderer 7d 滤镜链最前执行 = tML FilterManager.EndCapture MonoMod 前缀同位)。
//
// 本文件为 mod L2 脚本相位入口(loader.ts 动态 import 后调 main(sw)):
//   sw.screenFx({ id, exec }) —— exec(gl, pipe, inputTex, outFbo, w, h, state)
// 输出契约:终帧写 outFbo(GL 朝向,同滤镜 pass 出口;直通 blit/present 据此闭合)。
// 输入 inputTex = 链输入(恒等布局,v0=图像顶,未乘天色场景——FilterManager.cs
// :150-210 定谳)。
//
// GPU 管线(7 程序,4×1/3 分辨率 FBO + 1 全分辨率 FBO):
//   mask → godray(30/20 tap 单 pass) → ambient → lit(全) → bright → kawase×N → final(全)
// draw call 8+N/帧 vs 原版 tML ~40+;全分辨率 pass 2 vs 4。

// ---- 色带数据(原 mod rawimg 128×3 取行 0 = 128×1 RGBA,直 alpha——着色器自乘
//      c.a,禁预乘;来源 reference/ColorTex*.png)----
const RAMP_CLASSIC =
  'AAAAADkqoxE9LaIpQjCiREc0oWNMOKCEUjugpVhAn8NfRZ/eZUqe82xOnf90VJz/elmb/4Jfm/+JZJr/kWmY/5hvmP+fdJf/p3mX/65/lf+0hJT/u4mU/8GOk//GkpH/zJaR/9CZkP/Uno//2KGP/9ukjv/bpY3/26iM/9upjP/brIv/266L/9uviv/bsYn/27KK/9u0if/btoj/27eH/9u4iP/buYf/27qG/9u7hf/bvIX/272E/9u+hP/bv4P/28CD/9vAgv/bwYL/2sKB/9rBgf/YwYD/2MJ//9fBfv/VwX7/1cJ9/9TCfP/Twnv/08J6/9LCev/Swnn/0sJ5/9LCd//Swnb/0sF1/9LAdP/TwHL/1L9x/9W+b//WvW3/17xs/9i7a//ZuWj/2rhn/9u2Zf/dtmP/3rNh/9+yX//gsF3/4a9b/+OtWf/kq1f/5qlV/+enU//opVL/6KNQ/+ihTv/on03/6J1M/+ibSv/omUn/6JdI/+iVR//okUb/6I9G/+iNRv/oi0b/6IlG/+iHRv/ohEb/54JG/+R+SP/hekr/3XdM/9lyT//VblP/z2pW/8tlWv/EYF7/v1ti/7hWZ/+yUWz/rE1x/6VIdv+fQ3v/mT9//5M6hf+NNor/hzGO/4EukvJ9KZbOeCaaonMjnXJvIKBEax2jGwAAAAA=';
const RAMP_NIGHT =
  'AAAAADlMVwc5TFcPOUxXGTlMVyQ5TFcxOUxXPjpNV0s6TFdZOUxXZjlMV3M5TVd/OUxXizpMV5U5TFeaOUxXnTlMV585TVehOkxXozlMV6Y5TFeoOkxXqjpMV605TFevOUxXsTlMV7M5TFe2OUxXuDlMV7o5TFe8OUxXvjlMV8A6TFfCOUxXxDlMV8Y5TFfIOUxXyjlMV8w6TFfNOU1XzzlMV9E5TVfSOU1X1DpMV9Y5TFfXOUxX2DlNV9o6TFfbOkxX3DlMV945TVffOkxX4DlMV+E5TVfiOUxX4jpMV+M5TVfkOkxX5DpMV+U5TFflOkxX5jpMV+Y5TVfmOUxX5jpMV+Y5TFfmOUxX5jpNV+U5TFflOUxX5DlMV+Q5TFfjOUxX4jlNV+I5TFfhOkxX4DlNV986TFfeOkxX3DlMV9s6TFfaOUxX2DpMV9c5TFfWOkxX1DlMV9I5TFfROUxXzzlNV805TFfLOU1XyjpMV8g5TFfGOUxXxDlMV8I5TFfAOUxXvjpMV7w6TFe5OkxXtzlNV7U5TFezOkxXsTpMV645TFisOkxXqjlMV6g5TVelOkxXozlMV6E6TVeeOUxXnDpMV5o5TFeTOUxXijlMV385TVd0OkxXaDpMV1w5TFdQOUxXQzlMVzc5TVcsOU1XITlMVxc6TFgOOUxXBgAAAAA=';
const RAMP_ALT =
  'AAAAADkqoxE9LaIpQjCiREc0oWNMOKCEUjugpVhAn8NfRZ/eZUqe82xOnf90VJz/elmb/4Jfm/+JZJr/kWmY/5hvmP+fdJf/p3mX/65/lf+0hJT/u4mU/8GOk//GkpH/zJaR/9CZkP/Uno//2KGP/9ukjv/bpY3/26iM/9upjP/brIv/266L/9uviv/bsYn/27KK/9u0if/btoj/27eH/9u4iP/buYf/27qG/9u7hf/bvIX/272E/9u+hP/bv4P/28CD/9vAgv/bwYL/2sKB/9rBgf/YwYD/2MJ//9fBfv/VwX7/1cJ9/9TCfP/Twnv/08J6/9LCev/Swnn/0sJ5/9LCd//Swnb/0sF1/9LAdP/TwHL/1L9x/9W+b//WvW3/17xs/9i7a//ZuWj/2rhn/9u2Zf/dtmP/3rNh/9+yX//gsF3/4a9b/+OtWf/kq1f/5qlV/+enU//opVL/6KNQ/+ihTv/on03/6J1M/+ibSv/omUn/6JdI/+iVR//okUb/6I9G/+iNRv/oi0b/6IlG/+iHRv/ohEb/54JG/+R+SP/hekr/3XdM/9lyT//VblP/z2pW/8tlWv/EYF7/v1ti/7hWZ/+yUWz/rE1x/6VIdv+fQ3v/mT9//5M6hf+NNor/hzGO/4EukvJ9KZbOeCaaonMjnXJvIKBEax2jGwAAAAA=';

// ---- 着色器(GLSL 100,WebGL2 上下文合法——同 GLScreenFilters 约定) ----

// 内部 pass 共享 VERT:无 y 翻转 → 产【恒等布局】输出(v0=图像顶),采样输入 vUv 直取。
// (链契约 VERT 带 y 翻转产 GL 朝向,仅 las_final 用——见 VS_FINAL。)
const VS_INTERNAL = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, aPos.y * 2.0 - 1.0, 0.0, 1.0);
}`;

// 链出口专用 VERT:与 GLScreenFilters VERT 逐字同(带 y 翻转 → fboA 为 GL 朝向,
// v1=图像顶;非末 pass 直通 blit/末 pass present 据此闭合)。
const VS_FINAL = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

// Pass1 阴影掩码(Shadow.fx GetShadow 1:1;Additive(SrcAlpha,One) 黑底逐通道精推):
// rgb = dst.rgb += src.rgb·src.a = 1·pow = pow;alpha = dst.a += src.a·src.a = pow²
// (alpha 通道是 pow 的平方——godray 阶段 src.rgb·src.a 依赖此差异,pow³ 项来源)。
const FS_MASK = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform float uM;
void main() {
  float b = texture2D(uScene, vUv).b;
  float a = b < uM ? pow(1.0 - b, 0.75) : 0.0;
  gl_FragColor = vec4(a, a, a, a * a);
}`;

// ---- A/B 判别面(2026-10-13):修复前数学(mask rgb=α=pow / godray mask²·A²)。
//      配置 abOldGodray=true 时启用——用于判别翻转是否与着色器数学相关。 ----
const FS_MASK_OLD = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform float uM;
void main() {
  float b = texture2D(uScene, vUv).b;
  float a = b < uM ? pow(1.0 - b, 0.75) : 0.0;
  gl_FragColor = vec4(a, a, a, a);
}`;
const FS_GODRAY_OLD = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uSun;
uniform float uA0;
uniform float uAStep;
uniform float uScaleStep;
uniform int uTaps;
void main() {
  float acc = 0.0;
  for (int i = 0; i < 30; i++) {
    if (i >= uTaps) break;
    float fi = float(i);
    float scale = 1.0 + fi * uScaleStep;
    float m = texture2D(uMask, uSun + (vUv - uSun) / scale).r;
    float a = max(0.0, uA0 - fi * uAStep);
    acc += m * m * a * a;
  }
  gl_FragColor = vec4(acc, acc, acc, acc);
}`;

// Pass2 godray(原版 30/20 次全屏缩放叠加 Additive 绘制 → 单 pass 径向采样)。
// 逐 tap 贡献精推(SrcAlpha,One+默认精灵着色器×顶点色):
//   日:color=(1,1,1,A_i) → src.rgb=pow,src.a=pow²·A_i → dst += pow³·A_i
//   夜:Color.White*num9 四通道全乘 → src.rgb=pow·A,src.a=pow²·A → dst += pow³·A²
// 即 acc += mask.r·mask.a·w,w = A_i(日) / A_i²(夜,uASq 门)。
// A_i = A0 − i·AStep(Color 字节钳 ≥0);scale_i = 1 + i·scaleStep。
const FS_GODRAY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uSun;
uniform float uA0;
uniform float uAStep;
uniform float uScaleStep;
uniform float uASq;
uniform int uTaps;
void main() {
  float acc = 0.0;
  for (int i = 0; i < 30; i++) {
    if (i >= uTaps) break;
    float fi = float(i);
    float scale = 1.0 + fi * uScaleStep;
    vec2 m = texture2D(uMask, uSun + (vUv - uSun) / scale).ra;
    float a = max(0.0, uA0 - fi * uAStep);
    float w = uASq > 0.5 ? a * a : a;
    acc += m.x * m.y * w;
  }
  gl_FragColor = vec4(acc, acc, acc, acc);
}`;

// Pass3 环境光层(Light.fx 1:1 + NonPremultiplied 黑底两段钳精推):
// rgb = clamp01(c.rgb·s)·clamp01(c.a·s),a = clamp01(c.a·s),s = i·intensity。
// XNA Color 字节 tint 钳 → alpha 通道取 clamp01(c.a·s)。
const FS_AMBIENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uRamp;
uniform vec2 uSun;
uniform float uAspect;
uniform float uT;
uniform float uIntensity;
void main() {
  vec2 rpos = (vUv - uSun) * vec2(uAspect, 1.0);
  float i = (3.0 - length(rpos)) / 3.0;
  vec4 c = texture2D(uRamp, vec2(uT, 0.5));
  float s = i * uIntensity;
  float a = clamp(c.a * s, 0.0, 1.0);
  vec3 rgb = clamp(c.rgb * s, 0.0, 1.0) * a;
  gl_FragColor = vec4(rgb, a);
}`;

// lit 内联式(★2026-10-13 弱机刀:消灭 las_lit 全分辨率中间缓冲——原独立 lit pass
// 的数学折叠为共享片段式,final 逐像素内联=逐位精确(RGBA8 钳位以 min(·,1) 复刻);
// bright 在 1/3 降采样序上乘积交叉项有 ±1-2LSB 级偏差,K1-2 备案族同款,登记):
//   lit = clamp01(scene + max(amb.rgb − god, 0)·amb.a·ambientOn)
const GLSL_LIT = `
vec3 lasLit(vec3 scene, vec4 amb, vec3 god) {
  return min(scene + max(amb.rgb - god, vec3(0.0)) * amb.a * uAmbientOn, vec3(1.0));
}`;

// Pass4b 亮部提取(1/3;lit 内联——原 bright 采样加光后场景,线性降采样序偏差见上)。
const FS_BRIGHT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uAmbient;
uniform sampler2D uGodray;
uniform float uAmbientOn;
uniform float uM;
${GLSL_LIT}
void main() {
  vec3 lit = lasLit(texture2D(uScene, vUv).rgb, texture2D(uAmbient, vUv),
                    texture2D(uGodray, vUv).rgb);
  float lum = max(lit.r, max(lit.g, lit.b));
  gl_FragColor = vec4(lum > uM ? lit : vec3(0.0), 1.0);
}`;

// Pass6 Kawase(KawaseBlur.fx 1:1;uStep = 1/uScreenResolution =
// (2.5/w, 2.5/h)——原 uScreenResolution=(w/2.5,h/2.5) 倒数,uv 域跨分辨率等价;
// 原版 float d = distance+0.5 为死代码,taps 用整型 distance)。
const FS_KAWASE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uDist;
uniform float uI;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(uTex, vUv + uStep * vec2( 1.0,  1.0) * uDist).rgb;
  c += texture2D(uTex, vUv + uStep * vec2(-1.0,  1.0) * uDist).rgb;
  c += texture2D(uTex, vUv + uStep * vec2( 1.0, -1.0) * uDist).rgb;
  c += texture2D(uTex, vUv + uStep * vec2(-1.0, -1.0) * uDist).rgb;
  gl_FragColor = vec4(c * uI * 0.25, 1.0);
}`;

// Pass7 终帧(Bloom1.fx Blend 1:1;lit 内联——逐像素=逐位精确;XNA 输出合并器钳
// 语义:src.a=1+m2 钳 1 → 无放大项;α=pow(1−lum2,4.5),lum>1 时 HLSL pow=NaN→钳 0,
// 用 max(0,·) 等价)。
const FS_FINAL = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uAmbient;
uniform sampler2D uGodray;
uniform sampler2D uBloom;
uniform float uAmbientOn;
uniform float uM2;
uniform float uBloomOn;
${GLSL_LIT}
void main() {
  vec3 orig = lasLit(texture2D(uScene, vUv).rgb, texture2D(uAmbient, vUv),
                     texture2D(uGodray, vUv).rgb);
  float lum = orig.r * 0.3 + orig.g * 0.6 + orig.b * 0.1;
  float alpha = clamp(pow(max(0.0, 1.0 - lum), 4.5), 0.0, 1.0);
  vec3 bl = texture2D(uBloom, vUv).rgb;
  gl_FragColor = vec4(orig + bl * (uM2 * alpha) * uBloomOn, 1.0);
}`;

// 直通 blit(双开关配置全关时的链契约兜底;恒等布局→GL 朝向,同链 passthru)。
const FS_FLIP = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

const b64bytes = (b64) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

export default function main(sw) {
  // ---- 初始化态(首帧惰性建;管线程序/FBO 挂共享 GLPipeline 名空间) ----
  // ★2026-10-13 上下文重生守卫:引擎 reviveSwPipe=整实例更换(程序/FBO 表全清,
  //   "全消费方必须重注册")——本闭包的 ready/P/T 若不随实例失效,陈旧句柄在新
  //   上下文上调用=每调用静默 INVALID_OPERATION=输出槽从未写入=present 未初始化
  //   内存(用户实报:概率性干净 180° 翻转帧)。监视实例身份+上下文丢失,变更即
  //   失效重初始化。
  let ready = false;
  let failed = false;
  let initPipe = null;
  let initGl = null;
  const P = {};   // 程序句柄表
  const T = {};   // 色带纹理表

  const uploadRamp = (gl, tex, b64) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // 色带含有效 alpha 且着色器自乘 c.a → 必须直 alpha 上传(管线缺省预乘,
    // 临时翻 GLScreenFilters 同款 finally 还原纪律)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, b64bytes(b64));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const ensureInit = (gl, pipe) => {
    // 实例身份/存活守卫:revive(新实例)或上下文丢失 → 全量失效重初始化
    if (ready && (pipe !== initPipe || gl !== initGl || pipe.unavailable || gl.isContextLost())) {
      ready = false;
      failed = false;
      sw.log('GL 管线实例变更/上下文丢失,mod 重新初始化');
    }
    if (ready) return true;
    if (failed || pipe.unavailable) return false;
    const prog = (name, vs, fs) => {
      const h = pipe.program(name, vs, fs);
      if (!h.prog) { failed = true; return null; }
      return h;
    };
    P.mask = prog('las_mask', VS_INTERNAL, FS_MASK);
    P.godray = prog('las_godray', VS_INTERNAL, FS_GODRAY);
    P.maskOld = prog('las_mask_old', VS_INTERNAL, FS_MASK_OLD);       // A/B 判别面
    P.godrayOld = prog('las_godray_old', VS_INTERNAL, FS_GODRAY_OLD);
    P.ambient = prog('las_ambient', VS_INTERNAL, FS_AMBIENT);
    P.bright = prog('las_bright', VS_INTERNAL, FS_BRIGHT);
    P.kawase = prog('las_kawase', VS_INTERNAL, FS_KAWASE);
    P.final = prog('las_final', VS_FINAL, FS_FINAL);
    P.flip = prog('las_flip', VS_FINAL, FS_FLIP);
    if (failed) return false;
    for (const [k, b64] of [['classic', RAMP_CLASSIC], ['night', RAMP_NIGHT], ['alt', RAMP_ALT]]) {
      const tex = gl.createTexture();
      if (!tex) { failed = true; return false; }
      uploadRamp(gl, tex, b64);
      T[k] = tex;
    }
    // 环境自报(一次性;翻转归因/驱动分叉诊断面)
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      sw.log(`GL init ok: ${renderer} | ${String(gl.getParameter(gl.VERSION)).slice(0, 60)}`);
    } catch { /* 诊断面失败忽略 */ }
    ready = true;
    initPipe = pipe;
    initGl = gl;
    return true;
  };

  const draw = (pipe, prog, target, w, h) => {
    if (!target || !target.fbo) throw new Error('las fbo missing(上下文丢/租借失败)');   // exec try/catch 兜底
    pipe.bindTarget(target);
    pipe.setBlend('off');
    pipe.drawQuad(prog, [0, 0, w, h], 0);
  };

  // 直通兜底:任何失败路径都必须写 outFbo(链输出契约)——fboA 若留陈旧内容,
  // stack 装配积(G 朝向)会被 present 上屏=整帧翻转(2026-10-12 用户实报定谳)。
  const blitFallback = (gl, pipe, inputTex, outFbo, w, h) => {
    const fp = pipe.program('las_flip', VS_FINAL, FS_FLIP);
    if (!fp?.prog) return false;
    gl.useProgram(fp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(pipe.uni(fp, 'uTex'), 0);
    draw(pipe, fp, outFbo, w, h);
    gl.activeTexture(gl.TEXTURE0);
    return true;
  };

  const exec = (gl, pipe, inputTex, outFbo, w, h, st) => {
    if (w === 0 || h === 0) { blitFallback(gl, pipe, inputTex, outFbo, w, h); return; }
    try {
      execInner(gl, pipe, inputTex, outFbo, w, h, st);
    } catch (e) {
      // 任何 JS/GL 异常:直通兜底保契约(视觉=mod 缺席,绝不留 stale fboA)
      if (!warned) { warned = true; sw.log('exec 异常,退化直通:', (e && e.message) || e); }
      blitFallback(gl, pipe, inputTex, outFbo, w, h);
    }
  };
  let warned = false;

  const execInner = (gl, pipe, inputTex, outFbo, w, h, st) => {
    if (!ensureInit(gl, pipe)) {
      // 初始化失败(着色器编译失败/上下文丢):直通兜底,保链输出契约
      if (!warned) { warned = true; sw.log('GL 初始化失败,mod 效果缺席(直通模式)'); }
      blitFallback(gl, pipe, inputTex, outFbo, w, h);
      return;
    }
    // ---- 配置(每帧读 kv 内存值——面板改动即时生效;clampEntry 已钳界) ----
    const cfgNum = (k, d) => { const v = Number(sw.config.get(k)); return Number.isFinite(v) ? v : d; };
    const cfgBool = (k, d) => { const v = sw.config.get(k); return typeof v === 'boolean' ? v : d; };
    const useLight = cfgBool('useLight', true);
    const useBloom = cfgBool('useBloom', true);
    if (!useLight && !useBloom) {
      // 链契约兜底:直通(恒等→GL 朝向)
      gl.useProgram(P.flip.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(pipe.uni(P.flip, 'uTex'), 0);
      draw(pipe, P.flip, outFbo, w, h);
      gl.activeTexture(gl.TEXTURE0);
      return;
    }
    const lightIntensity = cfgNum('lightIntensity', 1);
    const moonIntensity = cfgNum('moonlightIntensity', 1);
    const shadowIntensity = cfgNum('shadowIntensity', 1);
    const bloomIntensity = cfgNum('bloomIntensity', 1);
    const bloomCounts = Math.max(1, Math.min(10, Math.round(cfgNum('bloomCounts', 4))));
    const dayColorAlt = String(sw.config.get('dayColor') ?? '') === 'Alternate';
    const abOldGodray = cfgBool('abOldGodray', false);   // A/B:修复前 godray 数学

    // ---- 状态推导(Lights.cs UseLightAndShadow 逐字移植) ----
    const cots = st.colorOfTheSkies;                       // [r,g,b] 0-255
    let num = (1 - 1.2 * cots[0] * 0.3 + cots[1] * 0.6 + cots[2] * 0.1) / 255;
    if (st.zoneSnow && !st.zoneCrimson && !st.zoneCorrupt) num -= st.bgAlphaFrontSnow * 0.1;
    if (st.zoneCrimson) num += 0.3;
    if (st.snowBgStyle === 263 || st.snowBgStyle === 258 || st.snowBgStyle === 267) num -= st.bgAlphaFrontSnow;
    if (st.snowBgStyle === 263) num -= st.bgAlphaFrontSnow * 0.5;
    if (st.desertBgStyle === 248) num -= st.bgAlphaFrontDesert * 0.9;
    let num2 = 1;
    if (st.moonPhase === 0) num2 = 1.01;
    if (st.moonPhase === 3 || st.moonPhase === 5) num2 = 0.9;
    if (st.moonPhase === 4) num2 = 0.6;
    let num3 = 0.8 * lightIntensity * (1 + num * 0.4);
    const playerTileY = st.playerCy / 16;
    if (playerTileY > st.worldSurface - 150) {
      const depth = playerTileY - (st.worldSurface - 150);
      num2 *= 1 - depth / 200;
      num3 *= 1 - depth / 600;
    }
    // 太阳屏位(Lights.cs GetSunPos/ToScreenCoords;恒等布局 = 画布 y 向下同域)
    const den = st.dayTime ? 27000 : 16200;
    const n2 = -st.screenY / (st.worldSurface * 16 - 600) * 200;
    const n3 = 1 - st.time / den;
    let sunX = (1 - n3) * st.viewW / 2 - 100 * n3;
    let sunY = n2 + n3 * n3 * 250 + 180;
    if (st.gravDir === -1) sunY = st.viewH - sunY;
    const sunU = sunX / st.viewW;
    const sunV = sunY / st.viewH;
    // 色带与强度(昼 ColorTex/Alt + num3;夜 ColorTex2 + 月光)
    const ramp = st.dayTime ? (dayColorAlt ? T.alt : T.classic) : T.night;
    const tU = st.dayTime ? st.time / 54000 : st.time / 32400;
    const intensity = st.dayTime ? num3 : 0.8 * moonIntensity * num2;
    // 环境光绘制门(原 PixelEX 载体四边形条件:地下=无环境光层)
    const ambientOn = st.playerCy < st.worldSurface * 16 + 800 ? 1 : 0;
    // 阴影阈值(昼 bgA[2] 调制,沙暴 248→m=1;夜 0.02)
    let shadowM = 1 - st.bgAlphaFrontDesert * 0.09;
    if (st.desertBgStyle === 248) shadowM = 1;
    if (!st.dayTime) shadowM = 0.02;
    // godray α 线性折叠参数(Color 字节钳 ≥0;uASq=夜档 A² 项——四通道全乘语义)
    let gA0; let gAStep; let gScaleStep; let gTaps; let gASq;
    if (st.dayTime) {
      const k = Math.max(0, (shadowIntensity + 0.1) * (num3 * 0.5 - 0.1));
      gA0 = Math.min(1, 0.55 * 30 / 120 * k);   // Color 字节 α 钳 ≤1
      gAStep = 0.55 / 120 * k;                   // A_i = A0 − i·AStep(30 tap 内恒 ≥0)
      gScaleStep = (1 / 3) * (0.014 + 3 * 0.01); // quality=3(原版非配置常量)
      gTaps = 30;
      gASq = 0;
    } else {
      gA0 = 20 / 190;
      gAStep = 1 / 190;
      gScaleStep = 0.01;
      gTaps = 20;
      gASq = 1;
    }
    // Bloom 参数
    const brightM = 0.71 - bloomIntensity * 0.01;
    const m2 = bloomIntensity;
    const kI = 1 + bloomCounts * 0.005;

    // ---- 1/3 分辨率(原版 screen/bloom RT 同档;奇除上取整防 0) ----
    const w3 = Math.max(1, Math.ceil(w / 3));
    const h3 = Math.max(1, Math.ceil(h / 3));

    const bindTex = (unit, tex) => {
      // ★2026-10-13 修复:generalize(原硬编码 0-2——final 合并后需 unit3,旧映射把
      //  bloom 绑到 unit2 顶掉 godray、uBloom 读陈旧绑定=渲染异常)
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };

    let fAmbTex = null;   // lit 内联输入(useLight∧ambientOn 时为本帧产物)
    let fGodTex = null;

    if (useLight && ambientOn) {
      // 地表档(ambientOn):完整光照管线。地下(ambientOn=0)整段跳过=字节等价
      // (原版数学此处贡献恒零:lightRT 黑 → (amb−god)·amb.a ≡ 0),省 4 pass。
      // Pass1 阴影掩码(1/3,采链输入;A/B 开关选新旧数学)
      const maskP = abOldGodray ? P.maskOld : P.mask;
      const fMask = pipe.fbo('las_mask', w3, h3);
      gl.useProgram(maskP.prog);
      bindTex(0, inputTex);
      gl.uniform1i(pipe.uni(maskP, 'uScene'), 0);
      gl.uniform1f(pipe.uni(maskP, 'uM'), shadowM);
      draw(pipe, maskP, fMask, w3, h3);

      // Pass2 godray(1/3,30/20 tap 单 pass——原版 30 次全屏叠加的等价折叠)
      const godrayP = abOldGodray ? P.godrayOld : P.godray;
      const fGod = pipe.fbo('las_godray', w3, h3);
      gl.useProgram(godrayP.prog);
      bindTex(0, fMask.tex);
      gl.uniform1i(pipe.uni(godrayP, 'uMask'), 0);
      gl.uniform2f(pipe.uni(godrayP, 'uSun'), sunU, sunV);
      gl.uniform1f(pipe.uni(godrayP, 'uA0'), gA0);
      gl.uniform1f(pipe.uni(godrayP, 'uAStep'), gAStep);
      gl.uniform1f(pipe.uni(godrayP, 'uScaleStep'), gScaleStep);
      if (!abOldGodray) gl.uniform1f(pipe.uni(godrayP, 'uASq'), gASq);
      gl.uniform1i(pipe.uni(godrayP, 'uTaps'), gTaps);
      draw(pipe, godrayP, fGod, w3, h3);

      // Pass3 环境光层(1/3——纯平滑径向渐变,双线性上采样视觉无损)
      const fAmb = pipe.fbo('las_ambient', w3, h3);
      gl.useProgram(P.ambient.prog);
      bindTex(1, ramp);
      gl.uniform1i(pipe.uni(P.ambient, 'uRamp'), 1);
      gl.uniform2f(pipe.uni(P.ambient, 'uSun'), sunU, sunV);
      gl.uniform1f(pipe.uni(P.ambient, 'uAspect'), w / h);
      gl.uniform1f(pipe.uni(P.ambient, 'uT'), tU);
      gl.uniform1f(pipe.uni(P.ambient, 'uIntensity'), intensity);
      draw(pipe, P.ambient, fAmb, w3, h3);
      // lit 不再单独落缓冲(弱机刀):lit 数学内联进 bright/final——全分辨率 pass
      // 2→1,las_lit 驻留删除。
      fAmbTex = fAmb.tex;
      fGodTex = fGod.tex;
    }

    // bright/final 的 lit 内联输入:useLight∧ambientOn 时=新产 amb/god,否则
    // 绑旧纹理 ×uAmbientOn=0(贡献零,=原版 rt1 未加光层语义)
    if (!fAmbTex) { fAmbTex = pipe.fbo('las_ambient', w3, h3).tex; }
    if (!fGodTex) { fGodTex = pipe.fbo('las_godray', w3, h3).tex; }
    const ambientOnEff = useLight && ambientOn ? 1 : 0;

    if (useBloom) {
      // Pass5 亮部提取(1/3;lit 内联)
      const fB0 = pipe.fbo('las_kb0', w3, h3);
      gl.useProgram(P.bright.prog);
      bindTex(0, inputTex);
      gl.uniform1i(pipe.uni(P.bright, 'uScene'), 0);
      bindTex(1, fAmbTex);
      gl.uniform1i(pipe.uni(P.bright, 'uAmbient'), 1);
      bindTex(2, fGodTex);
      gl.uniform1i(pipe.uni(P.bright, 'uGodray'), 2);
      gl.uniform1f(pipe.uni(P.bright, 'uAmbientOn'), ambientOnEff);
      gl.uniform1f(pipe.uni(P.bright, 'uM'), brightM);
      draw(pipe, P.bright, fB0, w3, h3);

      // Pass6 Kawase ×N ping-pong(las_kb0 ↔ las_kb1;奇偶终果落位同原版)
      gl.useProgram(P.kawase.prog);
      gl.uniform1i(pipe.uni(P.kawase, 'uTex'), 0);
      gl.uniform2f(pipe.uni(P.kawase, 'uStep'), 2.5 / w, 2.5 / h);
      gl.uniform1f(pipe.uni(P.kawase, 'uI'), kI);
      for (let i = 0; i < bloomCounts; i++) {
        const dst = pipe.fbo(i % 2 === 0 ? 'las_kb1' : 'las_kb0', w3, h3);
        const src = pipe.fbo(i % 2 === 0 ? 'las_kb0' : 'las_kb1', w3, h3);
        gl.uniform1f(pipe.uni(P.kawase, 'uDist'), i);
        bindTex(0, src.tex);
        draw(pipe, P.kawase, dst, w3, h3);
      }
      // 终果:bloomCounts 偶数→kb0,奇数→kb1(原版 screen/bloom 同式)
      const bloomTex = pipe.fbo(bloomCounts % 2 === 0 ? 'las_kb0' : 'las_kb1', w3, h3).tex;

      // Pass7 终帧(全分辨率,lit 内联,链出口 VERT → outFbo GL 朝向)
      gl.useProgram(P.final.prog);
      bindTex(0, inputTex);
      gl.uniform1i(pipe.uni(P.final, 'uScene'), 0);
      bindTex(1, fAmbTex);
      gl.uniform1i(pipe.uni(P.final, 'uAmbient'), 1);
      bindTex(2, fGodTex);
      gl.uniform1i(pipe.uni(P.final, 'uGodray'), 2);
      bindTex(3, bloomTex);
      gl.uniform1i(pipe.uni(P.final, 'uBloom'), 3);
      gl.uniform1f(pipe.uni(P.final, 'uAmbientOn'), ambientOnEff);
      gl.uniform1f(pipe.uni(P.final, 'uM2'), m2);
      gl.uniform1f(pipe.uni(P.final, 'uBloomOn'), 1);
      draw(pipe, P.final, outFbo, w, h);
      bindTex(1, null); bindTex(2, null); bindTex(3, null);
    } else {
      // bloom 关:终帧=lit 内联原样(全分辨率,恒等→GL 朝向)
      gl.useProgram(P.final.prog);
      bindTex(0, inputTex);
      gl.uniform1i(pipe.uni(P.final, 'uScene'), 0);
      bindTex(1, fAmbTex);
      gl.uniform1i(pipe.uni(P.final, 'uAmbient'), 1);
      bindTex(2, fGodTex);
      gl.uniform1i(pipe.uni(P.final, 'uGodray'), 2);
      gl.uniform1f(pipe.uni(P.final, 'uAmbientOn'), ambientOnEff);
      gl.uniform1f(pipe.uni(P.final, 'uM2'), m2);
      gl.uniform1f(pipe.uni(P.final, 'uBloomOn'), 0);
      draw(pipe, P.final, outFbo, w, h);
      bindTex(1, null); bindTex(2, null);
    }
    // 共享上下文纪律:还原激活单元 0(下游逐 pass 显式重绑,防陈旧绑定渗漏)
    gl.activeTexture(gl.TEXTURE0);
  };

  sw.screenFx({ id: 'lights_and_shadows', exec });
  sw.log('Lights And Shadows v1.4.2 (WebGL2 port) 注册完成——screenFx pass 已挂 7d 滤镜链');
}
