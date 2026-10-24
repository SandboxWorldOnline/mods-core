# mods-core

SandboxWorld 的 mod 集合仓——源码、构建与**商店注册表源仓**。

## 结构

```
<mod-id>/
  mod.json      # 商店 schema v2(必填:id/name/version/author/description/
                #   minEngine/category;可选:tags/dependencies/config)
  icon.png      # 商店卡片图标
  content/      # L1 声明式内容 / scripts/(L2 脚本) / textures/ / i18n/
tools/gen-mod-registry.mjs   # 注册表生成器(遍历 → registry.json)
```

## 商店架构（三层解耦）

- **源码层**：本仓（单仓多 mod）。巨型 mod（如 calamity）住独立仓 `-port` 后缀，
  通过同一 schema 向注册表发布；
- **索引层**：`registry.json`（CI merge 后自动再生，部署 CDN）；
- **产物层**：`.swmod` 构建产物随 GitHub Releases 分发，registry 登记 SHA-256。

## 构建一个 mod

在 Open-Terraria 仓内：`node scripts/mod-cli.mjs build <path-to-mod>` → `.swmod`。

## 注册表本地再生

```bash
node tools/gen-mod-registry.mjs
```

## 约定

- mod id：`[a-z0-9_]+`（商店键域，校验器强制）；
- `minEngine`：最低引擎版本（游戏内商店按当前版本过滤）；
- icon.png 缺失时生成器警告（不阻断）。

## 许可证

各 mod 的许可见其 `mod.json` 的 author 与 PORTING.md（如有）；仓内工具 MIT。
