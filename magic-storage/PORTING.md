# Magic Storage → SandboxWorld 移植说明

权威源:github.com/blushiemagic/MagicStorage,1.4.4 分支,v0.7.1(MIT)。
本移植 = **核心子集**(存储心脏/存储单元/存储访问装置/合成访问装置 + 邻接网络
+ 存取/搜索分页 + 存储池合成),非全量。

## 系统映射

| 原版 | 移植 | 说明 |
|---|---|---|
| TEStorageHeart(1307 行) | `storage_heart` tile + TE(state:{}) | 心脏=聚合入口,网络经 4 邻接泛洪 |
| TEStorageUnit(789 行) | `storage_unit` tile + TE(state.items=槽位数组) | 容量=config capacityPerUnit(缺省 40=原版基线);同 id 栈合并 |
| StorageAccess | `storage_access` tile + TE | 远程开网(同心脏) |
| CraftingAccess + Recipe 检索 | `crafting_access` tile + TE + 引擎带源配方面 | 材料源=网内单元槽数组(CraftItemSource),扣料原位落单元 |
| StorageGUI/CraftingGUI(tML UI) | sw.ui.panel(addSlot 网格 10×8/页+翻页+存取钮) | 搜索=登记债(引擎无文本输入件,暂以翻页替代) |

## 引擎侧新增面(本批)

- `sw.tileIdOf(key)` / `sw.tileEntitiesOf(key)`(TE 跨读——网络泛洪/单元态枚举)
- `game.vanillaAvailableRecipesWithSources(sources)` / `vanillaConsumeWithSources(r, sources)`
  (Game.cs 同式 ctx+自定义材料源;consumeMaterials 原生外部源=附近箱同通道)
- `GLPipeline.fbo` 分配后清零(未初始化 FBO 上屏根除,lights 批同刀)

## 网络语义(vanilla LocateHeart 简化保真)

存储家族 4 tile 以 **4 邻接**成网;心脏/访问装置/单元右键均开存储 UI(网内全单元
聚合视图);合成访问开合成 UI。单元被挖=TE onDestroy+出网。原版的连接器/远程
 LOC/升级范围扩展未含(邻接直连已覆盖基础玩法)。

## 已知未含(登记债)

容量升级链(蓝/绿/珠光/unit 变体)、模块槽、分解塔(DecraftingGUI)、环境塔、
便携访问、Shadow Diamond、联机同步(单人已可用)。

## 验证

- tests/mod-magic-storage.test.ts(mock 驱动 9 例):网络泛洪/容量/存取/满落掉落/
  合成扣料原位/断连
- mods/_integration:联合装载(calamity+lights+magic_storage)零错误
