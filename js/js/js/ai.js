/* 词汇星图 · ai.js —— DeepSeek 例句引擎（异步生成 + 永久缓存 + 预取队列） */
(function () {
'use strict';

const Star = window.Star;

/* 系统提示词：例句严格对齐六级真题语境 */
const SYS = [
  '你是大学英语六级（CET-6）词汇助教。请针对给定单词生成一条六级真题风格的学习素材。',
  '',
  '要求：',
  '1. 例句语境必须贴近六级真题常考话题：科技、教育、社会、环境、经济、文化、心理、职场、健康、校园生活等；',
  '2. 句式难度贴近六级阅读：可使用定语从句、状语从句、非谓语、被动语态，长度 14~26 个单词，用词不超纲；',
  '3. 必须使用该词在六级考试中最常考的义项与搭配（参考给定的大纲释义）；',
  '4. 中文翻译准确、自然；',
  '5. "collocation" 提取例句中该词最值得记的固定搭配；"tip" 给出一条简短考点提示（辨析/搭配/词形变化），没有就给空字符串；',
  '6. 只输出一个 JSON 对象，不要输出任何其它文字。格式：',
  '{"sentence":"英文例句","translation":"中文翻译","collocation":"核心搭配","tip":"考点提示"}'
].join('\n');

const MAX_CONC = 3;                 // 同时最多 3 个请求（含预取）
const inflight = Object.create(null);
const queue = [];
let active = 0;

function modelName() { return Star.cfg.model === 'fast' ? 'deepseek-chat' : 'deepseek-reasoner'; }

/* ---------- 对外主接口：拿一条例句（命中缓存则直接返回） ---------- */
Star.aiGet = function (word, def) {
  const cached = Star.aiCache[word];
  if (cached && cached.sentence) return Promise.resolve(cached);
  if (!Star.cfg.key) return Promise.reject({ code: 'nokey', msg: '还没有配置 API Key' });
  if (inflight[word]) return inflight[word];

  const p = new Promise(function (resolve, reject) {
    queue.push({ word: word, def: def || '', resolve: resolve, reject: reject });
    pump();
  });
  inflight[word] = p;
  p.then(function () { delete inflight[word]; }, function () { delete inflight[word]; });
  return p;
};

Star.aiReset = function (word) {
  delete Star.aiCache[word];
  Star.saveAiCache();
};

/* ---------- 内部：并发调度 ---------- */
function pump() {
  while (active < MAX_CONC && queue.length) {
    const task = queue.shift();
    active++;
    run(task).then(function () { active--; pump(); }, function () { active--; pump(); });
  }
}

async function run(task) {
  try {
    const entry = await callAPI(task.word, task.def);
    entry.ts = Date.now();
    entry.m = Star.cfg.model;
    Star.aiCache[task.word] = entry;
    Star.saveAiCache();
    task.resolve(entry);
  } catch (e) {
    task.reject(e);
  }
}

/* ---------- 调用 DeepSeek ---------- */
async function callAPI(word, def) {
  const model = modelName();
  const body = {
    model: model,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: '单词：' + word + '\n大纲释义：' + def }
    ],
    max_tokens: 900,
    stream: false
  };
  if (model === 'deepseek-chat') body.temperature = 1.1;

  let ctl = null, timer = null;
  if ('AbortController' in window) {
    ctl = new AbortController();
    timer = setTimeout(function () { ctl.abort(); }, 180000);
  }

  let res;
  try {
    res = await fetch((Star.cfg.base || 'https://api.deepseek.com/v1') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Star.cfg.key },
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined
    });
  } catch (e) {
    throw { code: 'net', msg: '网络错误或超时（可点重试）' };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    let hint = '';
    if (res.status === 401) hint = 'API Key 无效';
    else if (res.status === 402) hint = '余额不足';
    else if (res.status === 429) hint = '请求太频繁';
    else if (res.status >= 500) hint = 'DeepSeek 服务器繁忙';
    throw { code: 'http', msg: 'HTTP ' + res.status + (hint ? '（' + hint + '）' : '') };
  }

  const j = await res.json().catch(function () { return null; });
  const content = j && j.choices && j.choices[0] && j.choices[0].message
    ? (j.choices[0].message.content || '') : '';
  if (!content) throw { code: 'bad', msg: '模型返回为空' };
  return parseEntry(content);
}

/* ---------- 解析：兼容 JSON / 代码围栏 / 纯文本兜底 ---------- */
function parseEntry(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();

  let obj = null;
  try { obj = JSON.parse(s); } catch (e) {}
  if (!obj) {
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) {}
    }
  }
  if (obj && obj.sentence) {
    return {
      sentence: String(obj.sentence || ''),
      translation: String(obj.translation || ''),
      collocation: String(obj.collocation || ''),
      tip: String(obj.tip || '')
    };
  }
  if (s) return { sentence: s, translation: '', collocation: '', tip: '' };
  throw { code: 'bad', msg: '内容无法解析' };
}

})();
/* ===== ai.js 完 ===== */
