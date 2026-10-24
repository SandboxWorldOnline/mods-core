// 宿命之敌 L2 脚本 v2:Claude 巨蟹 / GPT 远古巨石——大体型 + 多段体节 + 位置积分。
// ★v2 关键修复:Enemy 位置积分是各 AI 分支的自担职责(原版语义,共享尾段不代做)
export default function main(sw) {
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const CLAUDE_ID = sw.npcIdOf('claude');
  const GPT_ID = sw.npcIdOf('gpt');
  const findHead = (game, id) => (game.entities.enemies ?? []).find((x) => x.vanillaId === id && !x.dead);

  sw.projectileHook('claude_spark', { update(p, game) {
    if ((p.ageTicks || 0) > 70) return;
    const t = game.player; if (!t) return;
    const want = Math.atan2(t.y + t.h / 2 - p.y, t.x + t.w / 2 - p.x);
    const cur = Math.atan2(p.vy, p.vx);
    let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    const na = cur + clamp(d, -0.05, 0.05);
    const s = Math.hypot(p.vx, p.vy) || 4.5;
    p.vx = Math.cos(na) * s; p.vy = Math.sin(na) * s;
  }});
  sw.projectileHook('gpt_orbit', { update(p) {
    const a = Math.atan2(p.vy, p.vx) + 0.075;
    const s = Math.hypot(p.vx, p.vy) || 2.2;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
  }});

  sw.npcAi('claude', (e, game, player) => {
    const t = player ?? game.player; if (!t) return;
    e.swT = (e.swT || 0) + 1;
    const r = e.life / e.maxHp;
    const phase = r <= 0.25 ? 3 : r <= 0.6 ? 2 : 1;
    if (phase !== e.swPhase) { e.swPhase = phase; e.swT = 0; e.swAtk = {}; e.swDash = 0; }
    const S = e.swT;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const px = t.x + t.w / 2, py = t.y + t.h / 2;
    const atk = (k, gap, fn) => { const m = e.swAtk ?? (e.swAtk = {}); m[k] = (m[k] || 0) + 1; if (m[k] >= gap) { m[k] = 0; fn(); } };
    if ((e.swDash || 0) > 0) { e.swDash--; e.vx *= 0.96; e.vy *= 0.96; }
    else {
      const side = Math.sin(S * 0.006) >= 0 ? 1 : -1;
      const tx = px + side * (170 - Math.min(60, S * 0.05));
      const ty = py - 60 + Math.sin(S * 0.02) * 30;
      const k = phase >= 3 ? 0.04 : 0.025;
      e.vx += ((tx - cx) * k - e.vx) * 0.08;
      e.vy += ((ty - cy) * k - e.vy) * 0.08;
      const cap = phase >= 3 ? 7.5 : 5.5;
      const sp = Math.hypot(e.vx, e.vy); if (sp > cap) { e.vx *= cap / sp; e.vy *= cap / sp; }
    }
    e.x += e.vx; e.y += e.vy;
    if (!e.swClaws && S > 20) { e.swClaws = true; sw.spawnNpc(game, 'claude_claw', cx - 120, cy + 10); sw.spawnNpc(game, 'claude_claw', cx + 120, cy + 10); }
    const aim = (i, n, speed, key, dmg) => { const base = Math.atan2(py - cy, px - cx); const a = base + (i - (n - 1) / 2) * 0.16; const ox = Math.cos(a) * 60, oy = Math.sin(a) * 40; sw.spawnProj(game, key, cx + ox, cy + oy, Math.cos(a) * speed, Math.sin(a) * speed, dmg); };
    atk('ring', phase >= 3 ? 95 : phase >= 2 ? 115 : 150, () => {
      const n = phase >= 3 ? 16 : phase >= 2 ? 12 : 10;
      for (let i = 0; i < n; i++) { const a = i * TAU / n + S * 0.01; sw.spawnProj(game, 'claude_star', cx + Math.cos(a) * 66, cy + Math.sin(a) * 48, Math.cos(a) * 3.6, Math.sin(a) * 3.6, 48); }
    });
    atk('aim', phase >= 2 ? 75 : 100, () => { for (let i = 0; i < 3; i++) aim(i, 3, 5.8, 'claude_spark', 58); });
    if (phase >= 2) {
      atk('spiral', 6, () => { e.swSpiral = (e.swSpiral || 0) + 0.43; const arms = phase >= 3 ? [-1, 1] : [1]; for (const sgn of arms) { const a = e.swSpiral * sgn + (sgn < 0 ? Math.PI : 0); sw.spawnProj(game, 'claude_petal', cx, cy, Math.cos(a) * 2.7, Math.sin(a) * 2.7, 42); } });
      atk('dash', phase >= 3 ? 220 : 330, () => { const dir = px >= cx ? 1 : -1; e.vx = dir * 12.5; e.vy = (py - cy) * 0.05; e.swDash = 26; });
    }
  });

  sw.npcAi('claude_claw', (e, game, player) => {
    const t = player ?? game.player; e.swT = (e.swT || 0) + 1;
    const head = findHead(game, CLAUDE_ID);
    if (!head) { e.swMissing = (e.swMissing || 0) + 1; if (e.swMissing > 90) e.life = 0; e.x += e.vx; e.y += e.vy; e.vx *= 0.9; e.vy *= 0.9; return; }
    const phase = head.swPhase || 1;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if ((e.swDash || 0) > 0) { e.swDash--; e.vx *= 0.96; e.vy *= 0.96; }
    else if (phase >= 2 && t && (e.swT % 300) > 250) { const a = Math.atan2(t.y + t.h / 2 - cy, t.x + t.w / 2 - cx); e.vx += (Math.cos(a) * 9 - e.vx) * 0.2; e.vy += (Math.sin(a) * 9 - e.vy) * 0.2; }
    else { const side = e.swSide ?? (e.swSide = cx < head.x + head.w / 2 ? -1 : 1); const anchorX = head.x + head.w / 2 + side * 108 + Math.sin(e.swT * 0.05) * 14; const anchorY = head.y + head.h / 2 + Math.sin(e.swT * 0.037) * 18; e.vx += ((anchorX - cx) * 0.06 - e.vx) * 0.12; e.vy += ((anchorY - cy) * 0.06 - e.vy) * 0.12; }
    e.x += e.vx; e.y += e.vy;
  });

  sw.npcAi('gpt', (e, game, player) => {
    const t = player ?? game.player; if (!t) return;
    e.swT = (e.swT || 0) + 1;
    const r = e.life / e.maxHp;
    const phase = r <= 0.33 ? 3 : r <= 0.66 ? 2 : 1;
    if (phase !== e.swPhase) { e.swPhase = phase; e.swT = 0; e.swAtk = {}; e.swDash = 0; }
    const S = e.swT;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const px = t.x + t.w / 2, py = t.y + t.h / 2;
    const atk = (k, gap, fn) => { const m = e.swAtk ?? (e.swAtk = {}); m[k] = (m[k] || 0) + 1; if (m[k] >= gap) { m[k] = 0; fn(); } };
    if ((e.swDash || 0) > 0) { e.swDash--; e.vx *= 0.975; e.vy *= 0.975; }
    else { const tx = px + Math.sin(S * 0.008) * 100; const ty = py - 130 + Math.cos(S * 0.011) * 40; const k = phase >= 3 ? 0.035 : 0.018; e.vx += ((tx - cx) * k - e.vx) * 0.07; e.vy += ((ty - cy) * k - e.vy) * 0.07; const cap = phase >= 3 ? 5.5 : 4.2; const sp = Math.hypot(e.vx, e.vy); if (sp > cap) { e.vx *= cap / sp; e.vy *= cap / sp; } }
    e.x += e.vx; e.y += e.vy;
    if (!e.swRunes && S > 20) { e.swRunes = true; for (let i = 0; i < 4; i++) sw.spawnNpc(game, 'gpt_rune', cx + Math.cos(i * Math.PI / 2) * 130, cy + Math.sin(i * Math.PI / 2) * 130); }
    const aim = (i, n, speed, key, dmg) => { const base = Math.atan2(py - cy, px - cx); const a = base + (i - (n - 1) / 2) * 0.22; const ox = Math.cos(a) * 66, oy = Math.sin(a) * 70; sw.spawnProj(game, key, cx + ox, cy + oy, Math.cos(a) * speed, Math.sin(a) * speed, dmg); };
    atk('fan', phase >= 3 ? 68 : phase >= 2 ? 84 : 105, () => { const n = phase >= 3 ? 7 : 5; for (let i = 0; i < n; i++) aim(i, n, 5, 'gpt_shard', 52); });
    atk('spiral', 6, () => { e.swSpiral = (e.swSpiral || 0) + 0.31; const arms = phase >= 3 ? [-1, 1] : [1]; for (const sgn of arms) { const a = e.swSpiral * sgn + (sgn < 0 ? Math.PI : 0); sw.spawnProj(game, 'gpt_blade', cx, cy + 60, Math.cos(a) * 3.1, Math.sin(a) * 3.1, 46); } });
    if (phase >= 2) {
      atk('rain', phase >= 3 ? 66 : 95, () => { const n = phase >= 3 ? 8 : 5; for (let i = 0; i < n; i++) { const x = px + (Math.random() * 2 - 1) * 170; sw.spawnProj(game, 'gpt_shard', x, py - 280 + Math.random() * 60, (Math.random() * 2 - 1) * 0.9, 6.6, 58); } });
      atk('orbit', 430, () => { for (let i = 0; i < 8; i++) { const a = i * TAU / 8; sw.spawnProj(game, 'gpt_orbit', cx + Math.cos(a) * 76, cy + Math.sin(a) * 76, Math.cos(a + Math.PI / 2) * 2.3, Math.sin(a + Math.PI / 2) * 2.3, 36); } });
      if (phase >= 3) atk('dash', 300, () => { const a = Math.atan2(py - cy, px - cx); e.vx = Math.cos(a) * 11.5; e.vy = Math.sin(a) * 11.5; e.swDash = 24; });
    }
  });

  sw.npcAi('gpt_rune', (e, game, player) => {
    const t = player ?? game.player; e.swT = (e.swT || 0) + 1;
    const head = findHead(game, GPT_ID);
    if (!head) { e.swMissing = (e.swMissing || 0) + 1; if (e.swMissing > 90) e.life = 0; e.x += e.vx; e.y += e.vy; e.vx *= 0.9; e.vy *= 0.9; return; }
    const phase = head.swPhase || 1;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const idx = e.swIdx ?? (e.swIdx = Math.floor(Math.random() * 4));
    const ang = idx * Math.PI / 2 + e.swT * 0.012;
    const anchorX = head.x + head.w / 2 + Math.cos(ang) * 150;
    const anchorY = head.y + head.h / 2 + Math.sin(ang) * 110;
    e.vx += ((anchorX - cx) * 0.05 - e.vx) * 0.11;
    e.vy += ((anchorY - cy) * 0.05 - e.vy) * 0.11;
    e.x += e.vx; e.y += e.vy;
    if (phase >= 3 && t && e.swT % 90 === idx * 22) { const a = Math.atan2(t.y + t.h / 2 - cy, t.x + t.w / 2 - cx); sw.spawnProj(game, 'gpt_blade', cx, cy, Math.cos(a) * 4.6, Math.sin(a) * 4.6, 40); }
  });

  sw.log('宿命之敌 v2 就位:巨蟹与巨石,体节齐全');
}
