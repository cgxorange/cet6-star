/* 词汇星图 · starmap.js —— canvas 星空：布局 / 渲染 / 触摸交互 / 星星卡片 */
(function () {
'use strict';
const Star = window.Star;
const M = Star.Map = {};
const TAU = Math.PI * 2;

let cv, ctx, W, H, DPR;
let pts = [];            // {cn, sn, r} 单位方向向量与归一化半径
let stCache = [];        // 渲染缓存
let allowGlow = true;
let view = { x: 0, y: 0, k: 1 };
let curIdx = -1;
let flashIdx = -1, flashT0 = 0;
const ptrs = new Map();
let moved = false, downX = 0, downY = 0, lastDist = 0;

/* ---------- 初始化 ---------- */
M.init = function () {
  cv = Star.$('sky');
  ctx = cv.getContext('2d');
  onResize();
  layout();
  bindPtr();
  Star.$('scClose').addEventListener('click', function () { Star.$('starCard').hidden = true; });
  Star.$('scStudy').addEventListener('click', function () {
    if (curIdx < 0) return;
    const w = Star.words[curIdx].w;
    Star.$('starCard').hidden = true;
    Star.go('learn');
    Star.Learn.studyOne(w);
  });
  window.addEventListener('resize', function () { onResize(); M.refresh(); });
  M.refresh();
};

function onResize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth || window.innerWidth;
  H = cv.clientHeight || window.innerHeight;
  const wpx = Math.round(W * DPR), hpx = Math.round(H * DPR);
  if (cv.width !== wpx || cv.height !== hpx) { cv.width = wpx; cv.height = hpx; }
}

/* 黄金角螺旋布局：高频词在中心，低频词向外扩散 */
function layout() {
  const n = Star.words.length, GA = 2.39996323;
  pts = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * GA + ((Star.hashStr(Star.words[i].w) % 997) / 997) * 0.4;
    pts[i] = { cn: Math.cos(a), sn: Math.sin(a), r: Math.sqrt(i / Math.max(1, n - 1)) };
  }
}

function geo() {
  return { cx: W / 2 + view.x, cy: H / 2 + view.y, maxR: Math.max(40, Math.min(W, H) * 0.46) };
}
function screenXY(i, g) {
  const p = pts[i], rad = p.r * g.maxR * view.k;
  return [g.cx + p.cn * rad, g.cy + p.sn * rad];
}

/* ---------- 状态缓存 + 渲染 ---------- */
function computeCache() {
  const n = Star.words.length;
  stCache = new Array(n);
  let litN = 0, dueN = 0;
  for (let i = 0; i < n; i++) {
    const st = Star.stateOf(Star.words[i].w);
    if (!st.lit) {
      stCache[i] = { lit: false, r: 1.1, col: 'rgba(64,74,112,0.45)' };
      continue;
    }
    litN++;
    if (st.due) dueN++;
    const k = st.k;
    const r = 1.3 + Math.min(st.s, 9) * 0.13 + k * 1.35;
    const cr = Math.round(120 + 135 * k), cg = Math.round(140 + 69 * k), cb = Math.round(230 - 128 * k);
    stCache[i] = {
      lit: true, r: r,
      col: 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.45 + 0.55 * k).toFixed(3) + ')',
      glow: k > 0.2,
      gcol: k > 0.55 ? '255,209,102' : '124,145,240',
      ga: (0.3 * k).toFixed(3)
    };
  }
  allowGlow = litN <= 500;
  return { litN: litN, dueN: dueN };
}

M.render = function (fast) {
  if (!ctx) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const g = geo();
  for (let i = 0; i < pts.length; i++) {
    const c = stCache[i];
    if (!c) continue;
    const p = pts[i], rad = p.r * g.maxR * view.k;
    const x = g.cx + p.cn * rad, y = g.cy + p.sn * rad;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    if (fast) {
      ctx.fillStyle = c.col;
      ctx.fillRect(x - c.r, y - c.r, c.r * 2, c.r * 2);
      continue;
    }
    if (allowGlow && c.glow) {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, c.r * 4.5);
      gr.addColorStop(0, 'rgba(' + c.gcol + ',' + c.ga + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, c.r * 4.5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = c.col;
    ctx.beginPath(); ctx.arc(x, y, c.r, 0, TAU); ctx.fill();
  }
};

M.refresh = function () {
  if (!ctx) return;
  const r = computeCache();
  M.render(false);
  Star.$('litCount').textContent = r.litN + '/' + Star.words.length;
  Star.$('dueCount').textContent = r.dueN;
  const d = Star.getDay();
  Star.$('todayCount').textContent = d.n + d.r;
};

M.onShow = function () { onResize(); M.refresh(); };

/* ---------- 新星点亮波纹动画 ---------- */
M.flash = function (word) {
  const i = Star.words.findIndex(function (x) { return x.w === word; });
  if (i < 0) return;
  flashIdx = i; flashT0 = performance.now();
  requestAnimationFrame(tick);
};
function tick(t) {
  if (flashIdx < 0) return;
  const dt = (t - flashT0) / 1000;
  if (dt > 1.4) { flashIdx = -1; M.render(false); return; }
  M.render(true);
  const xy = screenXY(flashIdx, geo());
  ctx.strokeStyle = 'rgba(255,209,102,' + Math.max(0, 1 - dt / 1.4).toFixed(3) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(xy[0], xy[1], 8 + dt * 80, 0, TAU); ctx.stroke();
  requestAnimationFrame(tick);
}

/* ---------- 触摸 / 鼠标交互 ---------- */
function clampView() {
  const lim = Math.min(W, H) * (1 + view.k) * 0.8;
  view.x = Math.max(-lim, Math.min(lim, view.x));
  view.y = Math.max(-lim, Math.min(lim, view.y));
}
function ptrDist() {
  const a = Array.from(ptrs.values());
  return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
}

function bindPtr() {
  cv.addEventListener('pointerdown', function (e) {
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downX = e.clientX; downY = e.clientY; moved = false;
    if (ptrs.size === 2) lastDist = ptrDist();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8) moved = true;
    if (ptrs.size === 1) {
      view.x += dx; view.y += dy; clampView(); M.render(true);
    } else if (ptrs.size === 2) {
      const d = ptrDist();
      if (lastDist > 0) {
        view.k = Math.max(0.5, Math.min(7, view.k * d / lastDist));
        clampView(); M.render(true);
      }
      lastDist = d;
    }
  });
  function end(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) lastDist = 0;
    if (ptrs.size === 0) {
      if (!moved) pickAt(e.clientX, e.clientY);
      M.render(false);
    }
  }
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', function (e) {
    ptrs.delete(e.pointerId); lastDist = 0; M.render(false);
  });
}

function pickAt(px, py) {
  const rect = cv.getBoundingClientRect();
  px -= rect.left; py -= rect.top;
  const g = geo();
  let best = -1, bd = 22 * 22;
  for (let i = 0; i < pts.length; i++) {
    const xy = screenXY(i, g);
    const d2 = (xy[0] - px) * (xy[0] - px) + (xy[1] - py) * (xy[1] - py);
    if (d2 < bd) { bd = d2; best = i; }
  }
  if (best >= 0) showCard(best);
  else Star.$('starCard').hidden = true;
}

function showCard(i) {
  curIdx = i;
  const it = Star.words[i];
  const st = Star.stateOf(it.w);
  Star.$('scWord').textContent = it.w;
  Star.$('scDef').textContent = it.d;
  const meta = Star.$('scMeta');
  if (!st.lit) meta.textContent = '尚未点亮 · 真题词频 ' + it.f;
  else meta.textContent = '记忆强度 ' + Math.round(st.k * 100) + '% · ' +
    (st.due ? '已到期，建议复习' : '下次复习 ' + Star.fmtHL(st.next - Date.now()) + '后');
  Star.$('starCard').hidden = false;
}

})();
/* ===== starmap.js 完 ===== */
