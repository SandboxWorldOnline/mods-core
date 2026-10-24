// ═══════════════════════════════════════════════════════════════════════
// 导演模式 mod v4.1 —— 全操作导演台（菜单态支持 + 时钟回退）
//
// 引擎面（director.ts 四读点 + 走位）：camTarget / inputLocked / playerHidden
//   / overlay / moveInput。空注册零成本，行为全在 mod。
//
// 核心系统：
//   Tween 引擎    —— 统一属性补间（fade/bars/flash/shake/zoomPunch/colorFade）
//   事件总线      —— 命令完成回调（walkTo 到达 / cam 补间完 → 触发后续命令）
//   时间线编译器  —— 分幕（acts）+ 相对时间 + 事件等待（after）+ 绝对时间兼容
//   相机路径      —— 多关键帧 + 缓动曲线（outCubic/inOutBack/…）
//   语义锚点      —— anchor + ref/dx/dy 相对坐标
//   场景模板      —— 常用组合封装（titleIn / fadeOut / establish / …）
//   截图回传      —— canvas.toDataURL → ws → Agent 可"看"画面
//   buildScript   —— 逐 tick JS 闭包（图灵完备动态建造，可调 emit()）
// ═══════════════════════════════════════════════════════════════════════

const TILE = 16;
const WS_URL = 'ws://127.0.0.1:7788';
const FONT = (px) => `${px}px "Fusion Pixel 12px", monospace`;

export default function main(sw) {
  if (typeof window === 'undefined') return;

  // ═══════ §1 缓动函数 ═══════
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const EASE = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inOutQuad: t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,
    inCubic: t => t*t*t,
    outCubic: t => 1 - Math.pow(1-t, 3),
    inOutCubic: t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
    outBack: t => { const s=1.70158; return 1+(s+1)*Math.pow(t-1,3)+s*Math.pow(t-1,2); },
    outElastic: t => t<=0?0 : t>=1?1 : Math.pow(2,-10*t)*Math.sin((t*10-.75)*(2*Math.PI/3))+1,
  };
  const easeOf = n => EASE[n] || EASE.inOutQuad;

  // ═══════ §2 状态 ═══════
  let clock = 0, ws = null, wsOk = false, game = null;
  let fpsCount = 0, fpsT = 0, fps = 0;
  const now = () => clock;

  const st = {
    cam: null, camTween: null, camZoom: null, camPath: null,
    inputLock: false, playerHide: false,
    move: null, walkTimer: null, walkTo: null,
    useTarget: null, useHeld: false,
    sub: null, title: null,
    anchors: {},
    buildFn: null, buildState: {},
    _shake: null,
  };

  // ═══════ §3 Tween 引擎 ═══════
  const tweens = new Map();
  function addTween(name, spec) {
    tweens.set(name, { ...spec, t0: now(), ease: easeOf(spec.ease) });
  }
  function tickTween(name) {
    const tw = tweens.get(name);
    if (!tw) return null;
    const p = clamp01((now() - tw.t0) / tw.dur);
    const v = tw.from + (tw.to - tw.from) * tw.ease(p);
    if (tw.onTick) tw.onTick(v);
    if (p >= 1) { tweens.delete(name); if (tw.id) emit(`${tw.id}:done`, { value: v }); }
    return v;
  }
  function cancelTween(name) { tweens.delete(name); }

  // ═══════ §4 事件总线 ═══════
  const eventQueue = [];
  const eventListeners = new Map();

  function emit(name, data) {
    send({ op: 'event', name, data: data || {} });
    for (const fn of (eventListeners.get(name) || [])) { try { fn(data || {}); } catch {} }
    const ready = eventQueue.filter(e => e.after === name);
    for (const e of ready) {
      eventQueue.splice(eventQueue.indexOf(e), 1);
      const { after, ...c } = e;
      try { exec(c); } catch (err) { send({ op: 'error', msg: String(err), c }); }
    }
  }

  // ═══════ §5 场景模板 ═══════
  const TEMPLATES = {
    titleIn: (p) => [
      { cmd: 'fade', to: 0, dur: p.fadeDur ?? 2 },
      { cmd: 'bars', on: true, dur: p.barsDur ?? 0.6 },
      { cmd: 'title', text: p.text, sub: p.sub, dur: p.dur ?? 4 },
    ],
    fadeOut: (p) => [
      { cmd: 'fade', to: 1, dur: p.dur ?? 1.5, color: p.color ?? '#000' },
    ],
    establish: (p) => [
      { cmd: 'camSnap', x: p.x, y: p.y, zoom: p.zoom ?? 1.3 },
      { cmd: 'fade', to: 0, dur: p.fadeDur ?? 1.5 },
      ...(p.text ? [{ cmd: 'subtitle', text: p.text, dur: p.subDur ?? 4 }] : []),
    ],
    battleStart: (p) => [
      { cmd: 'input', lock: true },
      { cmd: 'bars', on: true, dur: 0.4 },
      { cmd: 'shake', intensity: p.shake ?? 0.5, dur: 0.5 },
      { cmd: 'spawnMob', vid: p.vid ?? 4, x: p.x, y: p.y },
    ],
    dialogue: (p) => [
      { cmd: 'walkTo', x: p.x, y: p.y, dur: p.walkDur ?? 5, id: p.id ?? 'dlg' },
      { after: (p.id ?? 'dlg') + ':done', cmd: 'subtitle', text: p.text, dur: p.dur ?? 4 },
    ],
    timeShift: (p) => [
      { cmd: 'colorFade', to: 0.8, color: p.color ?? '#1a0a2e', dur: 0.8 },
      { cmd: 'time', hour: p.hour ?? 20 },
      { cmd: 'colorFade', to: 0, dur: 1.2 },
    ],
  };

  // ═══════ §6 引擎宿主 ═══════
  sw.director({
    camTarget() { return st.cam; },
    inputLocked() { return st.inputLock; },
    playerHidden() { return st.playerHide; },
    overlay(ctx, w, h) { try { drawOverlay(ctx, w, h); } catch {} },
    moveInput() { return st.move; },
  });

  // ═══════ §7 顶层绘制 ═══════
  function drawOverlay(ctx, w, h) {
    // 遮幅（动画）
    const barsV = tickTween('bars');
    if (barsV !== null && barsV > 0.001) {
      const bh = Math.round(h * 0.106 * barsV);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh);
    }
    // 黑/色 fade
    const fadeV = tickTween('fade');
    if (fadeV !== null && fadeV > 0.001) {
      ctx.globalAlpha = fadeV; ctx.fillStyle = tweens.get('fade')?.color || '#000';
      ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    // 独立色彩 fade（可叠加）
    const cV = tickTween('colorFade');
    if (cV !== null && cV > 0.001) {
      ctx.globalAlpha = cV; ctx.fillStyle = tweens.get('colorFade')?.color || '#000';
      ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    // Flash
    const fV = tickTween('flash');
    if (fV !== null && fV > 0.001) {
      ctx.globalAlpha = fV; ctx.fillStyle = tweens.get('flash')?.color || '#fff';
      ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    // 标题
    if (st.title && now() < st.title.until) {
      const age = now() - st.title.born;
      const a = Math.min(Math.min(1, age / 0.5), Math.min(1, (st.title.until - now()) / 0.6));
      ctx.globalAlpha = a; ctx.font = FONT(42); ctx.textAlign = 'center';
      ctx.fillStyle = '#05070C'; ctx.fillText(st.title.text, w/2+2, h*.42+2);
      ctx.fillStyle = '#EEE9DF'; ctx.fillText(st.title.text, w/2, h*.42);
      if (st.title.sub) { ctx.font = FONT(21); ctx.fillStyle = '#9C978F'; ctx.fillText(st.title.sub, w/2, h*.42+44); }
      ctx.globalAlpha = 1;
    }
    // 字幕
    if (st.sub && now() < st.sub.until) {
      const a = Math.min(1, (st.sub.until - now()) / 0.4);
      ctx.globalAlpha = a; ctx.font = FONT(28); ctx.textAlign = 'center';
      wrapLines(ctx, st.sub.text, w-260).forEach((ln, i, arr) => {
        const y = h-74-(arr.length-1-i)*36;
        ctx.fillStyle = '#05070C'; ctx.fillText(ln, w/2+2, y+2);
        ctx.fillStyle = '#EEE9DF'; ctx.fillText(ln, w/2, y);
      });
      ctx.globalAlpha = 1;
    }
    if (!wsOk) { ctx.globalAlpha=.55; ctx.font=FONT(14); ctx.textAlign='right'; ctx.fillStyle='#9C978F'; ctx.fillText('director: 未连接', w-14, 20); ctx.globalAlpha=1; }
  }
  function wrapLines(ctx, text, maxW) {
    const out=[]; let cur='';
    for (const ch of String(text)) { if (ctx.measureText(cur+ch).width>maxW && cur) { out.push(cur); cur=ch; } else cur+=ch; }
    if (cur) out.push(cur); return out.slice(0,3);
  }

  // ═══════ §8 锚点解析 ═══════
  function resolvePos(c) {
    if (c.ref) {
      const a = st.anchors[c.ref];
      if (!a) { send({op:'error',msg:`anchor '${c.ref}' not found`,c}); return null; }
      return { x: a.x+(c.dx||0), y: a.y+(c.dy||0) };
    }
    return { x: c.x, y: c.y };
  }

  // ═══════ §9 命令执行 ═══════
  // ★blob 模块内 '/src/...' 绝对路径解析成 blob:origin/src/...（非法）——
  //   必须拼 location.origin 全 URL（vite dev 按 URL 服务=同一模块实例,
  //   .ts 全名判例见 _mod-e2e-probe；本通道仅 dev server 语境）
  const engineImport = (p) => import(`${location.origin}/${p}`);
  function exec(c) {
    switch (c.cmd) {
      // ── 模板 ──
      case 'template': {
        const tpl = TEMPLATES[c.name];
        if (!tpl) { send({op:'error',msg:`template '${c.name}' not found`,c}); break; }
        for (const sub of tpl(c.params||{})) exec(sub);
        send({op:'ack',c:`template:${c.name}`});
        break;
      }
      // ── 锚点 ──
      case 'anchor': st.anchors[c.name]={x:c.x,y:c.y}; break;

      // ── 相机 ──
      case 'cam': {
        const pos = resolvePos(c); if (!pos) break;
        const tx=pos.x*TILE, ty=pos.y*TILE;
        if (c.dur && st.cam) {
          st.camTween={fx:st.cam.x,fy:st.cam.y,tx,ty,t0:now(),dur:c.dur,ease:easeOf(c.ease),id:c.id};
        } else {
          st.cam={x:tx,y:ty}; st.camTween=null;
          if (c.id) emit(`${c.id}:done`,{x:pos.x,y:pos.y});
        }
        if (c.zoom!=null) st.camZoom=c.zoom;
        break;
      }
      case 'camPath': {
        if (!c.keys||!c.keys.length) break;
        st.camPath={keys:c.keys,t0:now(),dur:c.keys[c.keys.length-1].t,id:c.id};
        st.cam={x:c.keys[0].x*TILE,y:c.keys[0].y*TILE};
        break;
      }
      case 'camSnap': {
        const pos=resolvePos(c); if (!pos) break;
        const cam=game&&game.camera;
        if (cam) { cam.x=pos.x*TILE; cam.y=pos.y*TILE; if (c.zoom!=null){cam.zoom=c.zoom;cam.zoomTarget=c.zoom;} }
        st.cam={x:pos.x*TILE,y:pos.y*TILE}; st.camTween=null; st.camZoom=null; st.camPath=null;
        break;
      }
      case 'camFollow': st.cam=null; st.camTween=null; st.camZoom=null; st.camPath=null; break;
      case 'shake': st._shake={intensity:c.intensity??.5,until:now()+(c.dur??.3),dur:c.dur??.3}; break;
      case 'zoomPunch': {
        const cam=game&&game.camera; if (!cam) break;
        const base=st.camZoom??cam.zoom;
        st.camZoom=base+(c.amount??.3);
        addTween('zoomPunch',{from:st.camZoom,to:base,dur:c.dur??.4,ease:'outBack',id:c.id,
          onTick:v=>{st.camZoom=v}});
        break;
      }

      // ── 走位 ──
      case 'walk': {
        st.move={x:c.dir||0,jump:!!c.jump,down:!!c.down};
        st.walkTimer=c.dur?{until:now()+c.dur}:null;
        st.walkTo=null;
        break;
      }
      case 'walkTo': {
        const pos=resolvePos(c); if (!pos) break;
        st.walkTo={x:pos.x,y:pos.y,until:c.dur?now()+c.dur:Infinity,id:c.id};
        break;
      }
      case 'stop': {
        st.move=null; st.walkTimer=null; st.walkTo=null;
        st.useTarget=null; st.useHeld=false;
        st.buildFn=null; st.buildState={};
        break;
      }

      // ── 操作 ──
      case 'select': if (game&&game.player) game.player.inv.selected=Math.max(0,Math.min(9,c.slot|0)); break;
      case 'useAt': {
        const pos=resolvePos(c); if (!pos) break;
        st.useTarget={x:pos.x,y:pos.y,until:c.hold?now()+c.hold:now()+.1};
        break;
      }
      case 'useHeld': st.useHeld=!!c.on; if (!c.on) st.useTarget=null; break;

      // ── 物品 ──
      case 'giveItem': if (game&&game.player) game.player.inv.add(c.vid|0,c.stack??1,undefined,undefined,true); break;

      // ── NPC/怪物 ──
      case 'spawnNpc': {
        if (!game) break;
        engineImport('src/entities/TownNPC.ts').then(({TownNPC})=>{
          game.entities.add(new TownNPC(c.key,c.x*TILE,c.y*TILE),'npcs');
          send({op:'ack',c:`spawnNpc ${c.key}`});
        }).catch(e=>send({op:'error',msg:String(e),c}));
        break;
      }
      case 'spawnMob': case 'spawnEnemy': {
        if (!game) break;
        engineImport('src/entities/Enemy.ts').then(({Enemy})=>{
          const e=Enemy.fromVanilla(c.vid|0,c.x*TILE,c.y*TILE);
          if (e) { e.id=game.entities.nextId++; game.entities.add(e,'enemies'); send({op:'ack',c:`${c.cmd} vid=${c.vid}`}); }
          else send({op:'error',msg:`${c.cmd} vid=${c.vid} failed`,c});
        }).catch(e=>send({op:'error',msg:String(e),c}));
        break;
      }
      case 'killNpc': {
        if (!game) break;
        const all=[...(game.entities.npcs||[]),...(game.entities.critters||[]),...(game.entities.enemies||[])];
        const targets=all.filter(n=>!n.dead&&(c.key?n.npcKey===c.key:n.vanillaId===c.vid));
        for (const t of targets) t.dead=true;
        send({op:'ack',c:`killNpc ${targets.length}`});
        break;
      }
      case 'listNpcs': {
        if (!game) break;
        const list=[...(game.entities.npcs||[]),...(game.entities.critters||[]),...(game.entities.enemies||[])]
          .filter(n=>!n.dead)
          .map(n=>({key:n.npcKey,vid:n.vanillaId,x:+(n.cx/TILE).toFixed(1),y:+(n.cy/TILE).toFixed(1)}));
        send({op:'npcs',list});
        break;
      }

      // ── 地形 ──
      case 'setTile': if (game) game.world.store.setTile(c.x|0,c.y|0,c.tile|0,c.frameX??0,c.frameY??0); break;
      case 'setWall': if (game) game.world.store.setWall(c.x|0,c.y|0,c.wall|0); break;
      case 'setLiquid': if (game) game.world.store.setLiquid(c.x|0,c.y|0,c.amount|0,c.type|0); break;
      case 'fillRect': {
        if (!game) break;
        const s=game.world.store;
        const x1=Math.min(c.x,c.x+(c.w||1)-1)|0, x2=Math.max(c.x,c.x+(c.w||1)-1)|0;
        const y1=Math.min(c.y,c.y+(c.h||1)-1)|0, y2=Math.max(c.y,c.y+(c.h||1)-1)|0;
        for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) s.setTile(x,y,c.tile|0);
        if (c.wall!=null) for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) s.setWall(x,y,c.wall|0);
        send({op:'ack',c:`fillRect ${x2-x1+1}×${y2-y1+1}`});
        break;
      }
      case 'clearRect': {
        if (!game) break;
        const s=game.world.store;
        const x1=c.x|0,y1=c.y|0,x2=(c.x+(c.w||1)-1)|0,y2=(c.y+(c.h||1)-1)|0;
        for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) { s.setTile(x,y,0); s.setWall(x,y,0); }
        send({op:'ack',c:`clearRect ${x2-x1+1}×${y2-y1+1}`});
        break;
      }

      // ── 世界 ──
      case 'newWorld': {
        // __swFlow 在 app 启动函数体内挂载——mod 装载可能早于它就绪，轮询等待
        // blank:true → 空白世界直通道（免 worldgen 秒进；引擎侧已带角色随身态补正）
        const go=()=>c.blank
          ? window.__swFlow.blankWorld(c.w??2100,c.h??700)
          : window.__swFlow.newWorld(c.seed||'director',c.w??4200,c.h??1200);
        const start=()=>go().then(()=>{
          send({op:'ack',c:'newWorld 完成'}); emit('newWorld:done');
        }).catch(e=>send({op:'error',msg:'newWorld: '+String(e),c}));
        const ready=()=>c.blank
          ? !!(window.__swFlow&&window.__swFlow.blankWorld)
          : !!(window.__swFlow&&window.__swFlow.newWorld);
        if (ready()) { send({op:'ack',c:'newWorld 开始'}); start(); }
        else {
          send({op:'ack',c:'newWorld 等 __swFlow…'});
          const iv=setInterval(()=>{ if (ready()) { clearInterval(iv); send({op:'ack',c:'newWorld 开始'}); start(); } },250);
          setTimeout(()=>clearInterval(iv),30000);
        }
        break;
      }
      case 'blankWorld': {
        if (!game) break;
        const w=game.world, ts=w.store;
        ts.type.fill(0); ts.flags.fill(0); ts.frameX.fill(0); ts.frameY.fill(0);
        ts.wall.fill(0); ts.liquid.fill(0); ts.liquidType.fill(0);
        ts.half.fill(0); ts.slope.fill(0); ts.wire.fill(0); ts.paint.fill(0); ts.paintWall.fill(0);
        if (game.chunks) game.chunks.invalidateAll();
        const px=c.x??Math.floor(w.w/2), py=c.y??Math.floor(w.h/3);
        ts.setTile(px,py,c.tile??1);
        const p=game.player;
        if (p) { p.x=px*TILE-p.w/2; p.y=py*TILE-p.h-1; p.vx=0; p.vy=0; }
        send({op:'ack',c:`blankWorld spawn=(${px},${py})`});
        break;
      }

      // ── 动态建造 ──
      case 'buildScript': {
        if (!c.code) { st.buildFn=null; st.buildState={}; send({op:'ack',c:'buildScript 清除'}); break; }
        try {
          st.buildFn=new Function('g','t','st','bs','emit',c.code);
          st.buildState={started:clock,...c.state};
          send({op:'ack',c:'buildScript 注册'});
        } catch(e) { send({op:'error',msg:`buildScript 编译失败: ${e.message}`,c}); }
        break;
      }
      case 'buildStop': st.buildFn=null; st.buildState={}; send({op:'ack',c:'buildScript 停止'}); break;

      // ── 转场 ──
      case 'fade': {
        const target=c.to??1;
        if (c.dur) addTween('fade',{from:tickTween('fade')??0,to:target,dur:c.dur,ease:c.ease,color:c.color||'#000',id:c.id});
        else { cancelTween('fade'); addTween('fade',{from:target,to:target,dur:.001,color:c.color||'#000',id:c.id}); }
        break;
      }
      case 'colorFade': {
        const target=c.to??0;
        if (c.dur) addTween('colorFade',{from:tickTween('colorFade')??0,to:target,dur:c.dur,ease:c.ease,color:c.color||'#000',id:c.id});
        else cancelTween('colorFade');
        break;
      }
      case 'bars': {
        const target=c.on?1:0;
        if (c.dur) addTween('bars',{from:tickTween('bars')??target,to:target,dur:c.dur,ease:'inOutQuad',id:c.id});
        else { cancelTween('bars'); addTween('bars',{from:target,to:target,dur:.001,id:c.id}); }
        break;
      }
      case 'flash': {
        addTween('flash',{from:c.amount??1,to:0,dur:c.dur??.3,ease:'outQuad',color:c.color||'#fff',id:c.id});
        break;
      }

      // ── 时间/玩家/天气/演出 ──
      case 'time': {
        const w=game&&game.world; if (!w||!w.clock) break;
        const cl=w.clock;
        if (c.tod!=null) cl.timeOfDay=clamp01(c.tod);
        if (c.hour!=null) cl.timeOfDay=clamp01((c.hour%24)/24);
        if (c.rate!=null) {
          if (c.rate===0) { if (!cl.__dirFrozen){cl.__dirFrozen=true;cl.__dirTick=cl.tick;cl.tick=()=>{};} }
          else { if (cl.__dirFrozen){cl.tick=cl.__dirTick;cl.__dirFrozen=false;} w.journeyTimeRate=c.rate; w.journeyFreezeTime=false; }
        }
        if (c.freeze===true&&!cl.__dirFrozen){cl.__dirFrozen=true;cl.__dirTick=cl.tick;cl.tick=()=>{};}
        if (c.freeze===false&&cl.__dirFrozen){cl.tick=cl.__dirTick;cl.__dirFrozen=false;}
        if (c.moonPhase!=null) cl.moonPhase=Math.max(0,Math.min(7,c.moonPhase|0));
        if (c.dayCount!=null) cl.dayCount=c.dayCount|0;
        if (c.bloodMoon!=null) cl.bloodMoon=!!c.bloodMoon;
        if (c.eclipse!=null) { cl.eclipse=!!c.eclipse; w.eclipse=!!c.eclipse; }
        break;
      }
      case 'player': {
        const p=game&&game.player; if (!p) break;
        const pos=resolvePos(c);
        if (pos&&pos.x!=null&&pos.y!=null) { p.x=pos.x*TILE-p.w/2; p.y=pos.y*TILE-p.h/2; p.vx=0; p.vy=0; }
        if (c.hide!=null) st.playerHide=!!c.hide;
        break;
      }
      case 'input': st.inputLock=!!c.lock; break;
      case 'subtitle': st.sub=c.text==null?null:{text:c.text,until:now()+(c.dur??3)}; break;
      case 'title': st.title=c.text==null?null:{text:c.text,sub:c.sub,until:now()+(c.dur??3),born:now()}; break;
      case 'weather': {
        const w=game&&game.world; if (!w||!w.weather) break;
        const wx=w.weather;
        if (c.raining!=null) { wx.raining=!!c.raining; if (c.raining) { wx.maxRaining=c.intensity??.8; wx.cloudAlpha=Math.max(wx.cloudAlpha,.5); wx.rainTime=c.duration??3600; } else wx.maxRaining=0; }
        if (c.clouds!=null) { wx.numClouds=c.clouds|0; wx.numCloudsTemp=c.clouds|0; }
        if (c.wind!=null) wx.windSpeedTarget=c.wind;
        if (c.storm!=null) { wx.storming=!!c.storm; wx.shouldUseStormMusic=!!c.storm; if (c.storm) { wx.raining=true; wx.maxRaining=1; wx.cloudAlpha=1; wx.windSpeedTarget=Math.max(Math.abs(wx.windSpeedTarget),.8); } }
        if (c.overcast!=null) wx.cloudBGActive=c.overcast?Math.abs(wx.cloudBGActive)||1:-1;
        if (c.lightning===true) { wx.lightning=1; wx.lightningDecay=.05; }
        if (c.sandstorm!=null&&wx.sandstorm) { wx.sandstorm.happening=!!c.sandstorm; if (c.sandstorm) { wx.sandstorm.severity=c.severity??.5; wx.sandstorm.intendedSeverity=c.severity??.5; wx.sandstorm.timeLeft=c.duration??3600; } }
        break;
      }

      // ── 音频 ──
      case 'music': { if (c.stop) sw.setMusic(-1); else if (c.id!=null) sw.setMusic(c.id|0); break; }
      case 'sfx': { sw.playSound([c.name],c.volume??1); break; }

      // ── 截图 ──
      case 'screenshot': {
        try {
          const src=document.querySelector('#gl')||document.querySelector('canvas');
          if (!src) { send({op:'error',msg:'no canvas',c}); break; }
          const tmp=document.createElement('canvas');
          tmp.width=src.width||1920; tmp.height=src.height||1080;
          const c2=tmp.getContext('2d');
          c2.drawImage(src,0,0);
          const data=tmp.toDataURL('image/png');
          send({op:'screenshot',size:data.length,data});
        } catch(e) { send({op:'error',msg:`screenshot: ${e.message}`,c}); }
        break;
      }

      case 'ping': send({op:'pong',t:c.t}); break;
      default: send({op:'error',msg:`unknown cmd: ${c&&c.cmd}`,c});
    }
  }

  // ═══════ §10 时间线编译 & 播放 ═══════
  let tl=null;

  function compileTimeline(data) {
    const entries=[];
    if (Array.isArray(data)) { entries.push(...data); return entries; }
    if (data.acts) {
      let offset=0;
      for (const act of data.acts) {
        for (const c of (act.commands||[])) {
          const e={...c};
          if (c.after!==undefined) { e.after=`${act.name}:${c.after}`; }
          else { e.t=offset+(c.t||0); }
          entries.push(e);
        }
        offset+=act.dur||0;
      }
    } else {
      for (const c of (data.tl||data.timeline||[])) entries.push({...c});
    }
    return entries;
  }

  function playTimeline(data) {
    clock=0; eventQueue.length=0;
    const all=compileTimeline(data);
    tl={entries:all.filter(e=>e.t!==undefined).sort((a,b)=>a.t-b.t),idx:0};
    for (const e of all.filter(e=>e.after!==undefined)) eventQueue.push(e);
    send({op:'ack',c:`play ${tl.entries.length} time + ${eventQueue.length} event`});
  }

  // ═══════ §11 每 tick ═══════
  // 菜单态回退：主菜单无 game loop → setInterval 推时钟 + 时间线 + 心跳
  // 世界内由 preUpdate 驱动（精确 dt）；菜单内 100ms 近似
  setInterval(() => {
    if (!game && wsOk) {
      clock += 0.1;
      tickTimeline();
    }
  }, 100);
  // 统一心跳（菜单/世界皆跑）
  setInterval(() => { if (wsOk) pushStatus(); }, 1000);

  // 时间线处理（从 preUpdate 抽出，菜单回退共用）
  function tickTimeline() {
    if (tl) {
      while (tl.idx < tl.entries.length && tl.entries[tl.idx].t <= clock) {
        const e = tl.entries[tl.idx++]; const { t, ...c } = e;
        try { exec(c); } catch (err) { send({ op: 'error', msg: String(err), c }); }
      }
      if (tl.idx >= tl.entries.length && eventQueue.length === 0) { tl = null; send({ op: 'tlDone' }); }
    }
  }

  sw.system({
    preUpdate(g,dt) {
      game=g; clock+=dt;
      fpsCount++; fpsT+=dt;
      if (fpsT>=1) { fps=Math.round(fpsCount/fpsT); fpsCount=0; fpsT=0; pushStatus(); }

      // 相机路径
      if (st.camPath) {
        const cp=st.camPath, elapsed=now()-cp.t0;
        if (elapsed>=cp.dur) {
          const last=cp.keys[cp.keys.length-1];
          st.cam={x:last.x*TILE,y:last.y*TILE};
          if (last.zoom!=null) st.camZoom=last.zoom;
          st.camPath=null;
          if (cp.id) emit(`${cp.id}:done`,{});
        } else {
          let k0=cp.keys[0],k1=cp.keys[cp.keys.length-1];
          for (let i=0;i<cp.keys.length-1;i++) {
            if (elapsed>=cp.keys[i].t&&elapsed<cp.keys[i+1].t) { k0=cp.keys[i]; k1=cp.keys[i+1]; break; }
          }
          const segDur=k1.t-k0.t||1;
          const p=easeOf(k1.ease)(clamp01((elapsed-k0.t)/segDur));
          st.cam={x:(k0.x+(k1.x-k0.x)*p)*TILE,y:(k0.y+(k1.y-k0.y)*p)*TILE};
          if (k1.zoom!=null&&k0.zoom!=null) st.camZoom=k0.zoom+(k1.zoom-k0.zoom)*p;
        }
      }
      // 相机补间
      if (st.camTween) {
        const tw=st.camTween;
        const p=easeOf(tw.ease)(clamp01((now()-tw.t0)/tw.dur));
        st.cam={x:tw.fx+(tw.tx-tw.fx)*p,y:tw.fy+(tw.ty-tw.fy)*p};
        if (p>=1) { st.camTween=null; if (tw.id) emit(`${tw.id}:done`,{}); }
      }
      // zoomPunch tween
      tickTween('zoomPunch');
      // 相机缩放
      if (st.camZoom!=null&&g.camera) g.camera.zoomTarget=st.camZoom;
      // 震动
      if (st._shake&&now()<st._shake.until&&g.camera) {
        const decay=Math.max(0,(st._shake.until-now())/st._shake.dur);
        const amp=st._shake.intensity*decay*TILE*.5;
        g.camera.x+=(Math.random()-.5)*amp;
        g.camera.y+=(Math.random()-.5)*amp;
      } else if (st._shake&&now()>=st._shake.until) st._shake=null;

      // 走位
      if (st.walkTimer&&now()>=st.walkTimer.until) { st.move=null; st.walkTimer=null; }
      if (st.walkTo) {
        const p=g.player;
        if (!p||now()>=st.walkTo.until) { st.move=null; st.walkTo=null; }
        else {
          const dx=st.walkTo.x-p.cx/TILE;
          const d=Math.hypot(dx,st.walkTo.y-(p.y+p.h/2)/TILE);
          if (d<1.5) {
            st.move=null;
            const id=st.walkTo.id; st.walkTo=null;
            if (id) emit(`${id}:done`,{x:p.cx/TILE,y:(p.y+p.h/2)/TILE});
            else emit('walkTo:done',{});
          } else {
            const dir=Math.abs(dx)<.3?0:Math.sign(dx);
            const stuck=dir!==0&&Math.abs(p.vx)<.1&&p.onGround;
            st.move={x:dir,jump:stuck,down:false};
          }
        }
      }

      // 操作（鼠标注入）
      const inp=g.input;
      if (st.useTarget||st.useHeld) {
        let sx,sy;
        if (st.useTarget) {
          const cam=g.camera;
          sx=(st.useTarget.x*TILE-cam.x)*cam.zoom+cam.viewW/2;
          sy=(st.useTarget.y*TILE-cam.y)*cam.zoom+cam.viewH/2;
          if (now()>=st.useTarget.until) st.useTarget=null;
        } else { sx=inp.mouseX; sy=inp.mouseY; }
        inp.mouseX=sx; inp.mouseY=sy; inp.mouseHeld=true; inp.mouseDown=true;
        if (g.player) {
          const wx=st.useTarget?st.useTarget.x*TILE:g.player.cx;
          g.player.facing=wx>=g.player.cx?1:-1;
        }
      }
      if (st.walkTo&&!st.useTarget&&!st.useHeld&&g.player) {
        const cam=g.camera;
        inp.mouseX=(st.walkTo.x*TILE-cam.x)*cam.zoom+cam.viewW/2;
        inp.mouseY=(st.walkTo.y*TILE-cam.y)*cam.zoom+cam.viewH/2;
      }

      // buildScript
      if (st.buildFn&&g.world) { try { st.buildFn(g,clock,g.world.store,st.buildState,emit); } catch {} }

      // 时间线（时间条目）
      tickTimeline();
    },
  });

  // ═══════ §12 WebSocket ═══════
  function send(o) { if (wsOk&&ws&&ws.readyState===1) { try { ws.send(JSON.stringify(o)); } catch {} } }
  function pushStatus() {
    const p=game&&game.player, w=game&&game.world;
    send({op:'status',fps,
      scene: game ? 'world' : 'menu',
      tod:w&&w.clock?+w.clock.timeOfDay.toFixed(3):null,
      player:p?{x:+(p.cx/TILE).toFixed(1),y:+((p.y+p.h/2)/TILE).toFixed(1),vx:+p.vx.toFixed(1)}:null,
      cam:game&&game.camera?{x:+(game.camera.x/TILE).toFixed(1),y:+(game.camera.y/TILE).toFixed(1),zoom:+game.camera.zoom.toFixed(2)}:null,
      playing:!!tl,queued:eventQueue.length,
      slot:p?p.inv.selected:null,
    });
  }
  function connect() {
    try { ws=new WebSocket(WS_URL); } catch { setTimeout(connect,2000); return; }
    ws.onopen=()=>{ wsOk=true; send({op:'hello',mod:'director',v:4}); pushStatus(); };
    ws.onmessage=(ev)=>{
      let m=null; try { m=JSON.parse(ev.data); } catch { return; }
      if (m.op==='cmd'&&m.c) { try { exec(m.c); send({op:'ack',c:m.c.cmd}); } catch(e) { send({op:'error',msg:String(e),c:m.c}); } }
      else if (m.op==='play') playTimeline(m.tl || m.timeline || m);
      else if (m.op==='stop') { tl=null; eventQueue.length=0; st.move=null; st.walkTimer=null; st.walkTo=null; st.useTarget=null; st.useHeld=false; st.buildFn=null; st.buildState={}; send({op:'ack',c:'stop'}); }
    };
    ws.onclose=()=>{ wsOk=false; setTimeout(connect,2000); };
    ws.onerror=()=>{ try { ws.close(); } catch {} };
  }
  connect();
  sw.log('导演模式 v4 就绪（tween/事件/分幕/模板/锚点/截图/音频）');
}
