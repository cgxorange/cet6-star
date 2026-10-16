/* 词汇星图 · core.js —— 数据层：配置 / 词库 / 进度 / 半衰期模型 */
(function () {
'use strict';

const Star = window.Star = {};
const HOUR = 3600e3, DAY = 24 * HOUR;
const MAX_STAGE = 9;

/* ---------- 本地存储 ---------- */
const K = {
  cfg: 'star.cfg.v1', prog: 'star.prog.v1', cache: 'star.words.v1',
  ai: 'star.ai.v1', day: 'star.day.v1'
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const DEFAULT_CFG = {
  key: '',                      // DeepSeek API Key（只存本机）
  model: 'deep',                // deep = deepseek-reasoner（深度思考）；fast = deepseek-chat
  daily: 12,                    // 每日新词参考值
  accent: 'en-US',              // 发音口音
  base: 'https://api.deepseek.com/v1'
};

/* ---------- 半衰期模型 ----------
   stage：0 = 待学/掉队；1..9 的半衰期依次为
   12h, 1d, 2d, 4d, 8d, 16d, 32d, 64d, 120d  */
const HL = [4 * HOUR, 12 * HOUR, DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY, 32 * DAY, 64 * DAY, 120 * DAY];

Star.hlFor = function (s) { return HL[Math.max(0, Math.min(MAX_STAGE, s | 0))]; };

/* ---------- 小工具 ---------- */
Star.$ = function (id) { return document.getElementById(id); };

Star.esc = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

Star.hashStr = function (s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

Star.fmtHL = function (ms) {
  if (!ms || ms <= 0) return '—';
  if (ms < HOUR) return Math.max(1, Math.round(ms / 60000)) + ' 分钟';
  if (ms < DAY) return Math.round(ms / HOUR) + ' 小时';
  const d = ms / DAY;
  if (d < 31) return (Math.round(d * 10) / 10) + ' 天';
  return Math.round(d / 30) + ' 个月';
};

/* ---------- 语音（浏览器自带 TTS，免费） ---------- */
Star.speak = function (text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = Star.cfg.accent || 'en-US';
    u.rate = 0.92;
    speechSynthesis.speak(u);
  } catch (e) {}
};

/* iOS 需要一次用户手势才能自动朗读，点击按钮时先"解锁" */
Star.unlockTTS = function () {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch (e) {}
};

/* ---------- 全局状态 ---------- */
Star.cfg = Object.assign({}, DEFAULT_CFG);
Star.prog = {};      // { 单词: { s: 等级, t: 上次作答时间 } }
Star.aiCache = {};   // { 单词: {sentence, translation, collocation, tip, ts, m} }
Star.day = null;
Star.words = [];     // 学习词表 [{w:单词, d:释义, f:词频}]，按词频降序

Star.saveCfg = function () { LS.set(K.cfg, Star.cfg); };
Star.saveProg = function () { LS.set(K.prog, Star.prog); };
Star.saveAiCache = function () { LS.set(K.ai, Star.aiCache); };

/* ---------- 今日统计（只看"今天来学了什么"，不做打卡惩罚） ---------- */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
Star.getDay = function () {
  const t = todayStr();
  if (!Star.day || Star.day.d !== t) Star.day = { d: t, n: 0, r: 0 };
  return Star.day;
};
function bumpDay(isNew) {
  const d = Star.getDay();
  if (isNew) d.n++; else d.r++;
  LS.set(K.day, d);
}

/* ---------- 记忆强度 / 到期判定 ---------- */
Star.strength = function (p) {
  if (!p || (p.s || 0) < 1) return 0;
  const el = Date.now() - p.t;
  return Math.max(0, Math.min(1, 1 - el / Star.hlFor(p.s)));
};

Star.stateOf = function (w) {
  const p = Star.prog[w];
  if (!p || (p.s || 0) < 1) return { lit: false, s: 0, k: 0, due: false, next: 0 };
  const hl = Star.hlFor(p.s);
  const el = Date.now() - p.t;
  return {
    lit: true, s: p.s,
    k: Math.max(0, Math.min(1, 1 - el / hl)),
    due: el >= hl,
    next: p.t + hl
  };
};

/* ---------- 核心：一次作答 → 更新半衰期 ----------
   v：'know'认识 / 'fuzzy'模糊 / 'unknown'不认识 / 'right'答对 / 'wrong'答错  */
Star.rate = function (word, v) {
  const old = Star.prog[word];
  const wasNew = !old || (old.s || 0) === 0;
  const p = old || { s: 0, t: 0 };

  if (v === 'know' || v === 'right') p.s = Math.min(MAX_STAGE, (p.s || 0) + 1);
  else if (v === 'fuzzy') p.s = (p.s || 0) > 0 ? p.s : 1;
  else p.s = Math.max(0, (p.s || 0) - 2);   // 不认识 / 答错：掉两档

  p.t = Date.now();
  Star.prog[word] = p;
  Star.saveProg();

  if (wasNew && p.s >= 1) bumpDay(true); else bumpDay(false);

  return { s: p.s, hl: p.s >= 1 ? Star.hlFor(p.s) : 0, wasNew: wasNew };
};

/* ---------- 队列 ---------- */
Star.newList = function () {          // 未点亮的词，按词频从高到低
  const out = [];
  for (const it of Star.words) {
    const p = Star.prog[it.w];
    if (!p || (p.s || 0) < 1) out.push(it);
  }
  return out;
};

Star.dueList = function () {          // 已到期的词，逾期越久越靠前
  const now = Date.now(), out = [];
  for (const it of Star.words) {
    const p = Star.prog[it.w];
    if (p && p.s >= 1) {
      const due = p.t + Star.hlFor(p.s);
      if (now >= due) out.push({ it: it, due: due });
    }
  }
  out.sort((a, b) => a.due - b.due);
  return out.map(x => x.it);
};

Star.litCount = function () {
  let n = 0;
  for (const it of Star.words) {
    const p = Star.prog[it.w];
    if (p && p.s >= 1) n++;
  }
  return n;
};

/* ---------- 词库加载：三源并行竞速（谁先成功用谁，单源 30 秒超时） ---------- */
const WORD_URLS = [
  'https://cdn.jsdelivr.net/gh/exam-data/CETVocabulary@main/cet_full_list.json',
  'https://fastly.jsdelivr.net/gh/exam-data/CETVocabulary@main/cet_full_list.json',
  'https://raw.githubusercontent.com/exam-data/CETVocabulary/main/cet_full_list.json'
];
const SRC_NAMES = ['jsDelivr', 'fastly', 'GitHub'];
const FETCH_TIMEOUT = 30000;

function fetchOne(url) {
  const ctl = ('AbortController' in window) ? new AbortController() : null;
  let timer = null;
  if (ctl) timer = setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT);
  return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (data) {
    if (timer) clearTimeout(timer);
    const rows = (data && data['四六级词汇词频排序表']) || [];
    if (!rows.length) throw new Error('数据为空');
    return rows;
  }, function (e) {
    if (timer) clearTimeout(timer);
    if (e && (e.name === 'AbortError' || /abort/i.test(e.message || ''))) throw new Error('超时');
    throw e;
  });
}

function fetchRows(onMsg) {
  onMsg('正在拉取词库（3 路并行加速）…');
  return new Promise(function (resolve, reject) {
    let pending = WORD_URLS.length, done = false;
    const errs = [];
    const slowTimer = setTimeout(function () {
      if (!done) onMsg('网络较慢，仍在并行拉取…');
    }, 8000);

    WORD_URLS.forEach(function (url, i) {
      fetchOne(url).then(function (rows) {
        if (done) return;
        done = true;
        clearTimeout(slowTimer);
        resolve(rows);
      }, function (e) {
        pending--;
        errs.push(SRC_NAMES[i] + '：' + ((e && (e.message || e.name)) || '未知错误'));
        if (pending === 0 && !done) {
          done = true;
          clearTimeout(slowTimer);
          reject(new Error('词库加载失败 → ' + errs.join('；')));
        }
      });
    });
  });
}

/* 筛选六级标星词（源数据已按真题词频降序），并精简体积 */
function buildList(rows) {
  const six = [], all = [];
  for (const r of rows) {
    const w = String(r['单词'] || '').trim();
    const d = String(r['释义'] || '').trim();
    if (!w || !d) continue;
    const rec = { w: w, d: d, f: Number(r['词频']) || 0 };
    all.push(rec);
    const mark = r['六级'];
    if (mark !== null && mark !== undefined && mark !== '' && mark !== false && mark !== 0) six.push(rec);
  }
  // 正常应有一千多个六级标星词；若异常偏少则保底取全表高频段
  return six.length >= 600 ? six : all.slice(0, 2500);
}

Star.init = async function (onMsg) {
  Star.cfg = Object.assign({}, DEFAULT_CFG, LS.get(K.cfg, {}));
  Star.prog = LS.get(K.prog, {}) || {};
  Star.aiCache = LS.get(K.ai, {}) || {};
  Star.day = LS.get(K.day, null);

  let list = LS.get(K.cache, null);
  if (!list || !list.length || !list[0].w) {
    const rows = await fetchRows(onMsg);
    onMsg('正在整理词库…');
    list = buildList(rows);
    LS.set(K.cache, list);
  }
  Star.words = list;
  Star.saveCfg();
  return list.length;
};

/* ---------- 导入 / 导出 ---------- */
Star.exportAll = function () {
  return JSON.stringify({ v: 1, ts: Date.now(), cfg: Star.cfg, prog: Star.prog, ai: Star.aiCache, day: Star.day });
};
Star.importAll = function (text) {
  const o = JSON.parse(text);
  if (o.cfg) LS.set(K.cfg, o.cfg);
  if (o.prog) LS.set(K.prog, o.prog);
  if (o.ai) LS.set(K.ai, o.ai);
  if (o.day) LS.set(K.day, o.day);
};
Star.resetProgress = function () {
  Star.prog = {};
  LS.set(K.prog, {});
  LS.del(K.day);
};

})();
/* ===== core.js 完 ===== */
