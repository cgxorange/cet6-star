/* 词汇星图 · learn.js —— 学习循环：自评 / 选择题 / 拼写题 / AI 例句 / 本轮重现 */
(function () {
'use strict';
const Star = window.Star;
const L = Star.Learn = {};
const $ = Star.$;

let queue = [];       // [{it, mode}] mode: new | rev | again
let qi = 0;
let cur = null, curMode = '', curStage = 0;
let locked = false;
let againList = [];
let batch = { n: 0, r: 0, answers: 0, hits: 0 };
let aiSeq = 0;

/* ---------- 绑定 ---------- */
L.init = function () {
  $('btnStart').addEventListener('click', function () { Star.unlockTTS(); L.startBatch(); });
  $('selfRate').addEventListener('click', function (e) {
    const b = e.target.closest('[data-r]');
    if (!b || locked) return;
    answer(b.dataset.r);
  });
  $('options').addEventListener('click', function (e) {
    const b = e.target.closest('button');
    if (!b || locked) return;
    locked = true;
    const ok = b.dataset.ok === '1';
    b.classList.add(ok ? 'right' : 'wrong');
    if (!ok) {
      Array.from($('options').children).forEach(function (x) {
        if (x.dataset.ok === '1') x.classList.add('right');
      });
    }
    setTimeout(function () { answer(ok ? 'right' : 'wrong'); }, 450);
  });
  $('btnSpellSubmit').addEventListener('click', submitSpell);
  $('spellInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitSpell(); });
  $('btnSpeak').addEventListener('click', function () { if (cur) Star.speak(cur.w); });
  $('btnNext').addEventListener('click', next);
  $('aiZone').addEventListener('click', function (e) {
    const b = e.target.closest('[data-re]');
    if (b && cur) { Star.aiReset(cur.w); renderAi(cur); }
  });
};

/* ---------- 批次 ---------- */
L.startBatch = function () {
  const due = Star.dueList().slice(0, 24);
  const nw = Star.newList().slice(0, Star.cfg.daily || 12);
  queue = [];
  due.forEach(function (it) { queue.push({ it: it, mode: 'rev' }); });
  nw.forEach(function (it) { queue.push({ it: it, mode: 'new' }); });
  if (!queue.length) { $('idleNext').textContent = '暂时没有可学的词，晚点再来。'; return; }
  qi = 0; againList = [];
  batch = { n: nw.length, r: due.length, answers: 0, hits: 0 };
  $('paneIdle').hidden = true;
  $('paneCard').hidden = false;
  showCard();
};

/* 从星图点进来的"单词练习" */
L.studyOne = function (word) {
  const it = Star.words.find(function (x) { return x.w === word; });
  if (!it) return;
  const p = Star.prog[word];
  queue = [{ it: it, mode: (p && p.s >= 1) ? 'rev' : 'new' }];
  qi = 0; againList = [];
  batch = { n: 0, r: 0, answers: 0, hits: 0 };
  $('paneIdle').hidden = true;
  $('paneCard').hidden = false;
  showCard();
};

/* ---------- 卡片展示 ---------- */
function showCard() {
  const item = queue[qi];
  cur = item.it; curMode = item.mode; locked = false;
  const p = Star.prog[cur.w];
  curStage = p ? (p.s || 0) : 0;

  $('bigWord').style.display = '';
  $('bigWord').textContent = cur.w;
  $('wordFreq').textContent = '真题词频 ' + cur.f;
  $('selfRate').hidden = true;
  $('quizBox').hidden = true;
  $('spellBox').hidden = true;
  $('detail').hidden = true;
  $('verdict').hidden = true;
  $('btnNext').hidden = true;
  $('defText').textContent = '';
  $('aiZone').innerHTML = '';
  $('spellInput').value = '';
  $('spellInput').classList.remove('bad');

  if (curMode === 'again') {
    $('wordTag').textContent = '再现一次';
    Star.speak(cur.w);
    revealDetail('这个词刚才没记住，再看一遍加深印象', 'bad');
  } else if (curMode === 'new') {
    $('wordTag').textContent = '新词';
    $('selfRate').hidden = false;
    Star.speak(cur.w);
  } else {
    $('wordTag').textContent = '复习 · 第 ' + (curStage + 1) + ' 档';
    if (curStage >= 3 && Math.random() < 0.45) buildSpell(); else buildQuiz();
    Star.speak(cur.w);
  }
  $('batchFill').style.width = Math.round(qi / queue.length * 100) + '%';
  $('batchLabel').textContent = (qi + 1) + ' / ' + queue.length;
  prefetchAhead();
}

/* ---------- 选择题 ---------- */
function buildQuiz() {
  const used = {};
  used[cur.d] = 1;
  const others = [];
  let guard = 0;
  while (others.length < 3 && guard++ < 300) {
    const it = Star.words[Math.floor(Math.random() * Star.words.length)];
    if (!it || it.w === cur.w || used[it.d]) continue;
    used[it.d] = 1;
    others.push(it.d);
  }
  const opts = [{ t: cur.d, ok: 1 }].concat(others.map(function (d) { return { t: d, ok: 0 }; }));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
  }
  const box = $('options');
  box.innerHTML = '';
  const LBL = ['A', 'B', 'C', 'D'];
  opts.forEach(function (o, i) {
    const b = document.createElement('button');
    b.dataset.ok = o.ok ? '1' : '0';
    b.innerHTML = '<b>' + LBL[i] + '</b><span>' + Star.esc(o.t) + '</span>';
    box.appendChild(b);
  });
  $('quizBox').hidden = false;
}

/* ---------- 拼写题 ---------- */
function buildSpell() {
  $('bigWord').style.display = 'none';
  $('spellDef').innerHTML = Star.esc(cur.d) +
    '<br><span class="tiny dim">首字母 ' + Star.esc(cur.w[0]) + ' · 共 ' + cur.w.length + ' 个字母 · 听发音拼写</span>';
  $('spellBox').hidden = false;
}

function submitSpell() {
  if (locked || !cur || $('spellBox').hidden) return;
  const val = $('spellInput').value.trim().toLowerCase();
  if (!val) return;
  locked = true;
  const ok = val === cur.w.toLowerCase();
  if (!ok) $('spellInput').classList.add('bad');
  answer(ok ? 'right' : 'wrong');
}

/* ---------- 统一作答 ---------- */
function answer(v) {
  if (!cur) return;
  locked = true;
  const res = Star.rate(cur.w, v);
  batch.answers++;
  const hit = (v === 'know' || v === 'right');
  if (hit) batch.hits++;
  if (hit && res.wasNew) L.lastLit = cur.w;

  if ((v === 'unknown' || v === 'wrong') && curMode !== 'again') againList.push(cur);

  $('selfRate').hidden = true;
  $('quizBox').hidden = true;
  $('spellBox').hidden = true;

  if (hit) {
    revealDetail('✅ 记住了 · 这个词的半衰期延长到 ' + Star.fmtHL(res.hl) + '，到点再回来', 'ok');
  } else if (v === 'fuzzy') {
    revealDetail('🟡 有点模糊 · 半衰期 ' + Star.fmtHL(res.hl) + '，很快就会再见到它', 'ok');
  } else if (v === 'unknown') {
    revealDetail('🔴 没记住 · 半衰期掉档了，本轮稍后会再看它一遍', 'bad');
  } else {
    revealDetail('❌ 这次没拼对 · 正确拼写：' + cur.w + '，本轮稍后再看一遍', 'bad');
  }
}

/* ---------- 详情 + AI 例句 ---------- */
function revealDetail(vtext, cls) {
  $('bigWord').style.display = '';
  $('defText').textContent = cur.d;
  $('detail').hidden = false;
  const vb = $('verdict');
  vb.className = 'verdict ' + (cls || '');
  vb.textContent = vtext;
  vb.hidden = false;
  $('btnNext').hidden = false;
  renderAi(cur);
}

async function renderAi(it) {
  const zone = $('aiZone');
  const seq = ++aiSeq;
  const cached = Star.aiCache[it.w];
  if (cached && cached.sentence) { paintAi(zone, it, cached, seq); return; }
  if (!Star.cfg.key) {
    zone.innerHTML = '<p class="ai-none">配置 API Key 后，这里会出现贴合六级真题语境的例句（设置 → 填入 Key）。</p>';
    return;
  }
  zone.innerHTML = '<div class="ai-loading"><span class="spin"></span><span>AI 正在生成六级风格例句…（' +
    (Star.cfg.model === 'fast' ? '快速' : '深度思考') + '）</span></div>';
  try {
    const entry = await Star.aiGet(it.w, it.d);
    if (seq !== aiSeq || !cur || cur.w !== it.w) return;
    paintAi(zone, it, entry, seq);
  } catch (e) {
    if (seq !== aiSeq) return;
    zone.innerHTML = '<p class="ai-none">例句生成失败：' + Star.esc((e && e.msg) || '未知错误') +
      '　<button class="ai-retry" data-re="1">点此重试</button></p>';
  }
}

function paintAi(zone, it, entry, seq) {
  if (seq !== aiSeq) return;
  let sent = Star.esc(entry.sentence || '');
  try {
    const re = new RegExp('\\b' + it.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'gi');
    sent = sent.replace(re, function (m) { return '<em>' + m + '</em>'; });
  } catch (e) {}
  let html = '<p class="ai-sent">' + sent + '</p>';
  if (entry.translation) html += '<p class="ai-tr">' + Star.esc(entry.translation) + '</p>';
  if (entry.collocation) html += '<div class="ai-meta-row"><span class="ai-colloc">搭配 · ' + Star.esc(entry.collocation) + '</span></div>';
  if (entry.tip) html += '<div class="ai-tip">考点 · ' + Star.esc(entry.tip) + '</div>';
  html += '<button class="ai-retry" data-re="1">换个例句</button>';
  zone.innerHTML = html;
}

/* 预取后面两个词的例句（不阻塞） */
function prefetchAhead() {
  if (!Star.cfg.key) return;
  for (let k = 1; k <= 2; k++) {
    const t = queue[qi + k];
    if (t && !Star.aiCache[t.it.w]) Star.aiGet(t.it.w, t.it.d).catch(function () {});
  }
}

/* ---------- 翻页 / 收尾 ---------- */
function next() {
  qi++;
  if (qi >= queue.length && againList.length) {
    againList.forEach(function (it) { queue.push({ it: it, mode: 'again' }); });
  }
  if (qi >= queue.length) return finish();
  showCard();
}

function finish() {
  $('paneCard').hidden = true;
  $('paneIdle').hidden = false;
  $('batchFill').style.width = '0%';
  $('batchLabel').textContent = '待机';
  const rate = batch.answers ? Math.round(batch.hits / batch.answers * 100) : 0;
  $('idleTitle').textContent = '这一轮完成了 ✦';
  $('idleSummary').textContent =
    '新词 ' + batch.n + ' 个 · 复习 ' + batch.r + ' 个 · 作答 ' + batch.answers + ' 次、记住 ' + batch.hits + ' 次（' + rate + '%）';
  L.refreshIdle(true);
  if (Star.refreshUI) Star.refreshUI();
  if (L.lastLit) Star.Map.flash(L.lastLit);
}

/* ---------- 待机面板 ---------- */
L.refreshIdle = function (afterBatch) {
  if (!$('idleSummary')) return;
  const dl = Star.dueList();
  const nw = Star.newList().length;
  if (!afterBatch) {
    $('idleTitle').textContent = dl.length > 0 ? '有 ' + dl.length + ' 颗星在等你' : '来点亮几颗新星';
    $('idleSummary').textContent = '待复习 ' + dl.length + ' 个 · 未点亮 ' + nw + ' 个 · 已点亮 ' + Star.litCount() + ' 个';
  }
  if (dl.length) {
    $('idleNext').textContent = '最早到期的词已经在等你了，随时可以开始。';
  } else {
    let soonest = Infinity;
    for (const it of Star.words) {
      const p = Star.prog[it.w];
      if (p && p.s >= 1) {
        const nxt = p.t + Star.hlFor(p.s);
        if (nxt < soonest) soonest = nxt;
      }
    }
    $('idleNext').textContent = soonest === Infinity
      ? '学过的新词会按各自的半衰期安排复习，不用打卡。'
      : '下一颗星大约 ' + Star.fmtHL(soonest - Date.now()) + '后到期；不用等它，现在学新词也行。';
  }
};

})();
/* ===== learn.js 完 ===== */
