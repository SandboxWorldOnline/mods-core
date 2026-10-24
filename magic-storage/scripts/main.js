// Magic Storage → SandboxWorld 移植(2026-10-14)。
// 权威源 = github.com/blushiemagic/MagicStorage 1.4.4 分支(MIT,v0.7.1);
// 本移植为**核心子集**:存储心脏/存储单元/存储访问装置/合成访问装置 + 邻接网络
// (4 邻接泛洪,vanilla LocateHeart 邻接语义) + 存入(全部/同类)/取出(1/整组)/
// 排序翻页 + 存储池合成(引擎 availableRecipes/consumeMaterials 的 CraftItemSource
// 外部源通道——扣料原位落在单元槽数组)。
// 未含(登记债,见 mod.json description):容量升级链/模块/分解塔/环境塔/便携访问。
// 持久化 = 引擎 sw.tileEntity(TE 随世界存档 serializeModTEs/restoreModTEs)。
// 依赖引擎面:sw.tileIdOf/tileEntitiesOf(本批新增)、sw.ui.panel.addSlot、
// game.vanillaAvailableRecipesWithSources/vanillaConsumeWithSources(本批新增)。

const UNIT_CAPACITY_DEFAULT = 40;
const COLS = 10, ROWS = 8;           // 网格 10×8 = 80 槽/页
const STACK_MAX = 999;

export default function main(sw) {
  const T_HEART = sw.tileIdOf('storage_heart');
  const T_UNIT = sw.tileIdOf('storage_unit');
  const T_ACCESS = sw.tileIdOf('storage_access');
  const T_CRAFT = sw.tileIdOf('crafting_access');
  const FAMILY = new Set([T_HEART, T_UNIT, T_ACCESS, T_CRAFT]);
  const capacityPerUnit = () => {
    const v = Number(sw.config.get('capacityPerUnit'));
    return Number.isFinite(v) && v >= 10 ? Math.min(400, Math.round(v)) : UNIT_CAPACITY_DEFAULT;
  };

  // ---- TE 注册(state 随世界存读;items=[{id,stack}] 内部物品 id) ----
  sw.tileEntity('storage_heart', { create: () => ({}) });
  sw.tileEntity('storage_access', { create: () => ({}) });
  sw.tileEntity('crafting_access', { create: () => ({}) });
  sw.tileEntity('storage_unit', { create: () => ({ items: [] }) });

  // ---- 网络:4 邻接泛洪存储家族 tile,收集网内单元锚位 ----
  function networkUnits(game, tx, ty) {
    const store = game.world.store;
    const seen = new Set([tx + ',' + ty]);
    const unitPos = [];
    const q = [[tx, ty]];
    while (q.length) {
      const [x, y] = q.pop();
      const i = store.idx(x, y);
      if (store.type[i] === T_UNIT && store.frameX[i] === 0 && store.frameY[i] === 0) unitPos.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || nx < 0 || ny < 0 || nx >= store.w || ny >= store.h) continue;
        const j = store.idx(nx, ny);
        if (!FAMILY.has(store.type[j])) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    // TE 枚举(一次)→ 按锚位过滤;容忍 TILE 枚举序 O(units)
    const all = sw.tileEntitiesOf('storage_unit');
    const byPos = new Map(all.map((te) => [te.x + ',' + te.y, te]));
    return unitPos.map(([x, y]) => byPos.get(x + ',' + y)).filter(Boolean)
      .filter((te) => Array.isArray(te.state.items));
  }

  // ---- 池视图 ----
  function poolEntries(units) {
    const out = [];
    for (const u of units) {
      const arr = u.state.items;
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (it && it.stack > 0) out.push({ unit: arr, idx: i, id: it.id, stack: it.stack });
      }
    }
    return out;
  }
  function merged(units) {
    const byId = new Map();
    for (const e of poolEntries(units)) {
      let m = byId.get(e.id);
      if (!m) { m = { id: e.id, stack: 0, slots: [] }; byId.set(e.id, m); }
      m.stack += e.stack;
      m.slots.push(e);
    }
    return [...byId.values()].sort((a, b) => b.stack - a.stack);
  }
  function usedSlots(units) {
    return units.reduce((a, u) => a + u.state.items.filter((i) => i && i.stack > 0).length, 0);
  }

  // ---- 存入:先并同 id 栈 → 后占空格(容量=每单元格数);onlyExisting=存入同类 ----
  function depositAll(game, units, onlyExisting) {
    const inv = game.player.inv.slots;
    let moved = 0;
    for (let s = 0; s < inv.length; s++) {
      const it = inv[s];
      if (!it || !it.id || it.stack <= 0) continue;
      if (onlyExisting && !poolEntries(units).some((e) => e.id === it.id)) continue;
      let rest = it.stack;
      for (const u of units) {                       // 先并同 id
        const arr = u.state.items;
        for (let i = 0; i < arr.length && rest > 0; i++) {
          if (arr[i] && arr[i].id === it.id && arr[i].stack < STACK_MAX) {
            const mv = Math.min(STACK_MAX - arr[i].stack, rest);
            arr[i].stack += mv; rest -= mv; moved += mv;
          }
        }
      }
      for (const u of units) {                       // 后占新格
        const arr = u.state.items;
        while (rest > 0 && arr.length < capacityPerUnit()) { arr.push({ id: it.id, stack: rest }); rest = 0; moved++; }
        if (rest <= 0) break;
      }
      if (rest > 0) it.stack = rest; else inv[s] = null;
    }
    return moved;
  }

  // ---- 取出:左键 1 / 右键整组;背包满落地为掉落物 ----
  function withdraw(game, entry, all) {
    const inv = game.player.inv.slots;
    let want = all ? entry.stack : Math.min(1, entry.stack);
    let got = 0;
    for (const e of entry.slots) {
      while (want > 0 && e.stack > 0) {
        let target = -1, empty = -1;
        for (let s = 0; s < inv.length; s++) {
          const it = inv[s];
          if (it && it.id === e.id && it.stack < STACK_MAX && target < 0) target = s;
          if (!it && empty < 0) empty = s;
          if (target >= 0 && empty >= 0) break;
        }
        if (target < 0 && empty < 0) break;   // 背包满
        const mv = Math.min(want, e.stack, target >= 0 ? STACK_MAX - inv[target].stack : STACK_MAX);
        if (mv <= 0) break;
        if (target >= 0) inv[target].stack += mv; else inv[empty] = { id: e.id, stack: mv };
        e.stack -= mv; want -= mv; got += mv;
      }
      if (e.stack <= 0) e.unit[e.idx] = null;
      if (want <= 0) break;
    }
    if (want > 0) {   // 背包满 → 剩余落地
      sw.spawnItem(game, entry.id, game.player.x, game.player.y, want);
      for (const e of entry.slots) {
        const mv = Math.min(want, e.stack);
        e.stack -= mv; got += mv; want -= mv;
        if (e.stack <= 0) e.unit[e.idx] = null;
        if (want <= 0) break;
      }
    }
    return got;
  }

  // ---- 存储 UI(10×8 槽/页;重建式刷新=close+reopen) ----
  function openStorageUI(game, tx, ty) {
    let page = 0;
    const build = () => {
      const units = networkUnits(game, tx, ty);
      if (!units.length) { sw.log('网络内没有存储单元——将存储单元与心脏/访问装置邻接放置成网'); return; }
      const cap = units.length * capacityPerUnit();
      const h = sw.ui.panel('storage', {
        title: `魔法存储 · 存储网络(${units.length} 单元)`, x: 110, y: 80,
        width: 476, height: 470, draggable: true, closable: true,
      });
      const all = merged(units);
      const maxPage = Math.max(0, Math.ceil(all.length / (COLS * ROWS)) - 1);
      if (page > maxPage) page = maxPage;
      h.addText(`格 ${usedSlots(units)}/${cap} · 物品种类 ${all.length}`, { x: 14, y: 34, scale: 0.8 });
      h.addButton('存入全部', { x: 296, y: 30, w: 76, h: 22, onClick: () => { depositAll(game, units, false); build(); } });
      h.addButton('存入同类', { x: 380, y: 30, w: 76, h: 22, onClick: () => { depositAll(game, units, true); build(); } });
      h.addText(`条目 ${all.length}`, { x: 14, y: 58, scale: 0.7 });
      h.addButton('◀', { x: 384, y: 54, w: 26, h: 20, onClick: () => { if (page > 0) { page--; build(); } } });
      h.addText(`${page + 1}/${maxPage + 1}`, { x: 414, y: 58, scale: 0.8 });
      h.addButton('▶', { x: 442, y: 54, w: 26, h: 20, onClick: () => { if (page < maxPage) { page++; build(); } } });
      const slice = all.slice(page * COLS * ROWS, (page + 1) * COLS * ROWS);
      for (let i = 0; i < COLS * ROWS; i++) {
        const m = slice[i];
        h.addSlot({
          x: 14 + (i % COLS) * 45, y: 80 + Math.floor(i / COLS) * 44,
          getItem: () => (m && m.stack > 0 ? { key: 'vi_' + m.id, stack: m.stack } : null),
          onLeftClick: () => { if (!m || m.stack <= 0) return; if (withdraw(game, m, false) > 0) build(); },
          onRightClick: () => { if (!m || m.stack <= 0) return; if (withdraw(game, m, true) > 0) build(); },
        });
      }
      h.addText('左键取 1 · 右键取整组 · 存入同类=只存已有种类(原版 Quick Stack 语义)', { x: 14, y: 444, scale: 0.7 });
    };
    build();
  }

  // ---- 合成访问 UI:引擎带源配方面(storage 池=CraftItemSource,扣料原位落单元) ----
  function openCraftUI(game, tx, ty) {
    let page = 0;
    const build = () => {
      const units = networkUnits(game, tx, ty);
      if (!units.length) { sw.log('网络内没有存储单元'); return; }
      const sources = units.map((u) => ({ items: u.state.items }));
      const avail = game.vanillaAvailableRecipesWithSources(sources);
      const maxPage = Math.max(0, Math.ceil(avail.length / (COLS * ROWS)) - 1);
      if (page > maxPage) page = maxPage;
      const h = sw.ui.panel('crafting', {
        title: '魔法存储 · 合成访问', x: 110, y: 80, width: 476, height: 470,
        draggable: true, closable: true,
      });
      h.addText(`可用配方 ${avail.length}(材料=存储网络+背包)`, { x: 14, y: 34, scale: 0.8 });
      h.addButton('◀', { x: 384, y: 30, w: 26, h: 20, onClick: () => { if (page > 0) { page--; build(); } } });
      h.addText(`${page + 1}/${maxPage + 1}`, { x: 414, y: 34, scale: 0.8 });
      h.addButton('▶', { x: 442, y: 30, w: 26, h: 20, onClick: () => { if (page < maxPage) { page++; build(); } } });
      const slice = avail.slice(page * COLS * ROWS, (page + 1) * COLS * ROWS);
      for (let i = 0; i < COLS * ROWS; i++) {
        const row = slice[i];
        h.addSlot({
          x: 14 + (i % COLS) * 45, y: 60 + Math.floor(i / COLS) * 44,
          getItem: () => (row ? { key: 'vi_' + row.r.create, stack: row.r.createStack } : null),
          onLeftClick: () => {
            const n = game.vanillaConsumeWithSources(row.r, units.map((u) => ({ items: u.state.items })), 1);
            if (n > 0) build(); else sw.log('材料不足(网络变动后)');
          },
        });
      }
      h.addText('点击图标=合成 1 组(材料自动从存储网络与背包原位扣取)', { x: 14, y: 444, scale: 0.7 });
    };
    build();
  }

  // ---- tile 右键(返回 true=消费右键) ----
  sw.tileInteract('storage_heart', (tx, ty, game) => { openStorageUI(game, tx, ty); return true; });
  sw.tileInteract('storage_unit', (tx, ty, game) => { openStorageUI(game, tx, ty); return true; });
  sw.tileInteract('storage_access', (tx, ty, game) => { openStorageUI(game, tx, ty); return true; });
  sw.tileInteract('crafting_access', (tx, ty, game) => { openCraftUI(game, tx, ty); return true; });

  sw.log('Magic Storage (core subset) 注册完成——心脏/单元/访问/合成访问 4 tile + TE 随档持久化');
}
