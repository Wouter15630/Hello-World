// ── State ──────────────────────────────────────────────────────
let settings    = null;
let bonuses     = [];
let tickTimer   = null;

// Active mode selection for each form (tracks the toggle independently of settings)
let setupMode    = 'hours';
let settingsMode = 'hours';

// ── Storage ────────────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(localStorage.getItem('et_settings')); }
  catch { return null; }
}

function saveSettings() {
  localStorage.setItem('et_settings', JSON.stringify(settings));
}

function loadBonuses() {
  try { return JSON.parse(localStorage.getItem('et_bonuses')) || []; }
  catch { return []; }
}

function saveBonuses() {
  localStorage.setItem('et_bonuses', JSON.stringify(bonuses));
}

// ── Helpers ────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// "HH:MM" → seconds since midnight
function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 3600 + m * 60;
}

// Format a number as €X,XXX.XX (or €X.XXXX for per-second display)
function eur(amount, dp = 2) {
  const fixed = Math.abs(amount).toFixed(dp);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '€' + withCommas + (decPart !== undefined ? '.' + decPart : '');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── Calculations ───────────────────────────────────────────────
function daysInCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function totalWorkSecondsPerDay() {
  if (settings.mode === '247') return 86400;
  const diff = parseTime(settings.workEnd) - parseTime(settings.workStart);
  return diff > 0 ? diff : 1; // guard against bad config
}

function perSecondRate() {
  if (settings.mode === '247') {
    return settings.monthlyEarnings / (daysInCurrentMonth() * 86400);
  }
  return settings.monthlyEarnings / (settings.workDaysPerMonth * totalWorkSecondsPerDay());
}

function nowSecondsOfDay() {
  const n = new Date();
  return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds() + n.getMilliseconds() / 1000;
}

function elapsedSeconds() {
  const now = nowSecondsOfDay();
  if (settings.mode === '247') return now;
  const start = parseTime(settings.workStart);
  const end   = parseTime(settings.workEnd);
  if (now < start) return 0;
  if (now >= end)  return end - start;
  return now - start;
}

// 'before' | 'active' | 'done'
function workStatus() {
  if (settings.mode === '247') return 'active';
  const now   = nowSecondsOfDay();
  const start = parseTime(settings.workStart);
  const end   = parseTime(settings.workEnd);
  if (now < start) return 'before';
  if (now >= end)  return 'done';
  return 'active';
}

function todayBonuses() {
  const key = todayKey();
  return bonuses.filter(b => b.date === key);
}

function todayBonusTotal() {
  return todayBonuses().reduce((sum, b) => sum + b.amount, 0);
}

// ── Tick / UI Update ───────────────────────────────────────────
function tick() {
  const rate    = perSecondRate();
  const elapsed = elapsedSeconds();
  const total   = totalWorkSecondsPerDay();
  const earned  = rate * elapsed + todayBonusTotal();
  const pct     = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  const status  = workStatus();

  // Main counter
  document.getElementById('counter').textContent = eur(earned);

  // Progress bar
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('prog-pct').textContent = pct.toFixed(1) + '%';

  // Date label
  const now = new Date();
  document.getElementById('date-display').textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Status badge
  const badge = document.getElementById('status-badge');
  badge.className = 'status-badge ' + status;
  if (status === 'active') {
    badge.textContent = settings.mode === '247' ? '24/7 · Running' : 'Working · Live';
  } else if (status === 'before') {
    badge.textContent = 'Work starts at ' + settings.workStart;
  } else {
    badge.textContent = 'Workday complete';
  }

  // Rate cards
  document.getElementById('rate-hour').textContent = eur(rate * 3600);
  document.getElementById('rate-min').textContent  = eur(rate * 60);
  document.getElementById('rate-sec').textContent  = eur(rate, 4);

  // Progress time labels
  if (settings.mode === '247') {
    document.getElementById('prog-start').textContent = '00:00';
    document.getElementById('prog-end').textContent   = '24:00';
  } else {
    document.getElementById('prog-start').textContent = settings.workStart;
    document.getElementById('prog-end').textContent   = settings.workEnd;
  }
}

// ── Bonus List ─────────────────────────────────────────────────
function renderBonuses() {
  const list  = document.getElementById('bonus-list');
  const items = todayBonuses();

  if (items.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = items.map(b => `
    <div class="bonus-item" data-id="${b.id}">
      <span class="bonus-item-label" title="${escapeHtml(b.label)}">${escapeHtml(b.label)}</span>
      <span class="bonus-item-amount">+${eur(b.amount)}</span>
      <button type="button" class="bonus-item-delete" data-id="${b.id}" title="Remove">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.bonus-item-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      bonuses = bonuses.filter(b => b.id !== Number(btn.dataset.id));
      saveBonuses();
      renderBonuses();
      tick();
    });
  });
}

// ── Screen Management ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function startMainScreen() {
  showScreen('main-screen');
  renderBonuses();
  tick();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 100); // 100 ms → smooth sub-second updates
}

// ── Mode Toggle Helpers ────────────────────────────────────────
function applyModeToggle(toggleEl, configEl, mode) {
  toggleEl.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  configEl.classList.toggle('collapsed', mode === '247');
}

function initModeToggle(toggleEl, configEl, getMode, setMode) {
  toggleEl.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setMode(btn.dataset.mode);
      applyModeToggle(toggleEl, configEl, btn.dataset.mode);
    });
  });
}

// ── Setup Form ─────────────────────────────────────────────────
function initSetup() {
  const toggle = document.getElementById('setup-mode-toggle');
  const config = document.getElementById('setup-hours-config');

  initModeToggle(
    toggle, config,
    () => setupMode,
    m  => { setupMode = m; }
  );

  document.getElementById('setup-form').addEventListener('submit', e => {
    e.preventDefault();
    const earnings = parseFloat(document.getElementById('setup-earnings').value);
    if (!earnings || earnings <= 0) return;

    settings = {
      monthlyEarnings:  earnings,
      mode:             setupMode,
      workStart:        document.getElementById('setup-start').value || '09:00',
      workEnd:          document.getElementById('setup-end').value   || '17:00',
      workDaysPerMonth: parseInt(document.getElementById('setup-days').value) || 22,
    };

    saveSettings();
    startMainScreen();
  });
}

// ── Settings Modal ─────────────────────────────────────────────
function openSettings() {
  document.getElementById('s-earnings').value = settings.monthlyEarnings;
  document.getElementById('s-start').value    = settings.workStart;
  document.getElementById('s-end').value      = settings.workEnd;
  document.getElementById('s-days').value     = settings.workDaysPerMonth;
  settingsMode = settings.mode;
  applyModeToggle(
    document.getElementById('s-mode-toggle'),
    document.getElementById('s-hours-config'),
    settingsMode
  );
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function initSettingsModal() {
  const toggle = document.getElementById('s-mode-toggle');
  const config = document.getElementById('s-hours-config');

  initModeToggle(
    toggle, config,
    () => settingsMode,
    m  => { settingsMode = m; }
  );

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-settings-btn').addEventListener('click', closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click', closeSettings);

  document.getElementById('settings-form').addEventListener('submit', e => {
    e.preventDefault();
    const earnings = parseFloat(document.getElementById('s-earnings').value);
    if (!earnings || earnings <= 0) return;

    settings = {
      monthlyEarnings:  earnings,
      mode:             settingsMode,
      workStart:        document.getElementById('s-start').value || '09:00',
      workEnd:          document.getElementById('s-end').value   || '17:00',
      workDaysPerMonth: parseInt(document.getElementById('s-days').value) || 22,
    };

    saveSettings();
    closeSettings();
    tick();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset all data? This clears your settings and all bonus entries.')) {
      localStorage.removeItem('et_settings');
      localStorage.removeItem('et_bonuses');
      location.reload();
    }
  });
}

// ── Bonus Modal ────────────────────────────────────────────────
function openBonusModal() {
  document.getElementById('bonus-label-input').value  = '';
  document.getElementById('bonus-amount-input').value = '';
  document.getElementById('bonus-modal').classList.remove('hidden');
  document.getElementById('bonus-label-input').focus();
}

function closeBonusModal() {
  document.getElementById('bonus-modal').classList.add('hidden');
}

function initBonusModal() {
  document.getElementById('add-bonus-btn').addEventListener('click', openBonusModal);
  document.getElementById('close-bonus-btn').addEventListener('click', closeBonusModal);
  document.getElementById('bonus-backdrop').addEventListener('click', closeBonusModal);

  document.getElementById('bonus-form').addEventListener('submit', e => {
    e.preventDefault();
    const label  = document.getElementById('bonus-label-input').value.trim();
    const amount = parseFloat(document.getElementById('bonus-amount-input').value);
    if (!label || !amount || amount <= 0) return;

    bonuses.push({ id: Date.now(), label, amount, date: todayKey() });
    saveBonuses();
    closeBonusModal();
    renderBonuses();
    tick();
  });
}

// ── Keyboard Shortcuts ─────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSettings();
    closeBonusModal();
  }
});

// ── Init ───────────────────────────────────────────────────────
function init() {
  settings = loadSettings();
  bonuses  = loadBonuses();

  initSetup();
  initSettingsModal();
  initBonusModal();

  if (settings) {
    startMainScreen();
  } else {
    showScreen('setup-screen');
  }
}

document.addEventListener('DOMContentLoaded', init);
