/* 词汇星图 · app.js —— 启动 / 底部导航 / 设置页 / 数据导入导出 */
(function () {
'use strict';
const Star = window.Star;
const $ = Star.$;

/* ---------- 视图切换 ---------- */
Star.go = function (v) {
  ['map', 'learn', 'settings'].forEach(function (k) {
    $('view-' + k).classList.toggle('active', k === v);
  });
  Array.from(document.querySelectorAll('#tabs .tab')).forEach(function (t) {
    t.classList.toggle('active', t.dataset.view === v);
  });
  if (v === 'map') {
    Star.Map.onShow();
    if (Star.Learn.lastLit) { Star.Map.flash(Star.Learn.lastLit); Star.Learn.lastLit = null; }
  } else if (v === 'learn') {
    Star.Learn.refreshIdle();
  } else if (v === 'settings') {
    renderStats();
  }
};

function bindTabs() {
  Array.from(document.querySelectorAll('#tabs .tab')).forEach(function (t) {
    t.addEventListener('click', function () { Star.go(t.dataset.view); });
  });
}

/* ---------- 设置页 ---------- */
function loadCfgToUI() {
  const c = Star.cfg;
  $('cfgKey').value = c.key || '';
  $('cfgDaily').value = String(c.daily || 12);
  $('cfgAccent').value = c.accent || 'en-US';
  Array.from(document.querySelectorAll('#cfgModel .seg-btn')).forEach(function (b) {
    b.classList.toggle('active', b.dataset.m === (c.model === 'fast' ? 'fast' : 'deep'));
  });
}

function bindSettings() {
  $('cfgKey').addEventListener('input', function () {
    Star.cfg.key = this.value.trim();
    Star.saveCfg();
  });
  $('cfgDaily').addEventListener('change', function () {
    Star.cfg.daily = parseInt(this.value, 10) || 12;
    Star.saveCfg();
  });
  $('cfgAccent').addEventListener('change', function () {
    Star.cfg.accent = this.value;
    Star.saveCfg();
  });
  Array.from(document.querySelectorAll('#cfgModel .seg-btn')).forEach(function (b) {
    b.addEventListener('click', function () {
      Star.cfg.model = b.dataset.m;
      Star.saveCfg();
      loadCfgToUI();
    });
  });

  $('btnExport').addEventListener('click', function () {
    const blob = new Blob([Star.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'star-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  $('btnImport').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    const f = this.files && this.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        Star.importAll(String(r.result));
        alert('导入成功，页面将刷新');
        location.reload();
      } catch (e) {
        alert('导入失败：文件格式不对');
      }
    };
    r.readAsText(f);
  });
  $('btnReset').addEventListener('click', function () {
    if (confirm('清空全部学习进度？（设置和例句缓存会保留）')) {
      Star.resetProgress();
      alert('已清空，页面将刷新');
      location.reload();
    }
  });
}

function renderStats() {
  const d = Star.getDay();
  $('statLine').textContent =
    '已点亮 ' + Star.litCount() + ' / ' + Star.words.length +
    ' 个 · 今日：新学 ' + d.n + ' 个、复习 ' + d.r + ' 次' +
    ' · AI 例句缓存 ' + Object.keys(Star.aiCache).length + ' 条';
}

/* ---------- 启动 ---------- */
async function boot() {
  const bootEl = $('boot'), msg = $('bootMsg');
  try {
    await Star.init(function (m) { msg.textContent = m; });
  } catch (e) {
    msg.innerHTML = Star.esc(e.message || '词库加载失败') + '<br>请检查网络后刷新重试。';
    return;
  }
  Star.Map.init();
  Star.Learn.init();
  bindTabs();
  bindSettings();
  loadCfgToUI();

  Star.refreshUI = function () {
    Star.Map.refresh();
    Star.Learn.refreshIdle();
    renderStats();
  };
  Star.refreshUI();

  bootEl.classList.add('off');
  setTimeout(function () { bootEl.hidden = true; }, 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
/* ===== app.js 完 ===== */
