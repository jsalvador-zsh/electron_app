/**
 * Main renderer entry point: routing, navigation, global utilities.
 */

// ─── Router ───────────────────────────────────────────────────────────────────
const VIEWS = {
  dashboard:  window.DashboardView,
  employees:  window.EmployeesView,
  attendance: window.AttendanceView,
  reports:    window.ReportsView,
  devices:    window.DevicesView,
  settings:   window.SettingsView,
};

const TITLES = {
  dashboard:  'Dashboard',
  employees:  'Empleados',
  attendance: 'Registros de Asistencia',
  reports:    'Planillas y Reportes',
  devices:    'Dispositivos ZKTeco',
  settings:   'Configuración',
};

let currentView = null;

function navigate(viewId) {
  const view = VIEWS[viewId];
  if (!view) return;

  // Nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });

  // Breadcrumb
  document.getElementById('breadcrumb').textContent = TITLES[viewId] || viewId;

  // Render
  const container = document.getElementById('view-container');
  container.innerHTML = view.render();
  container.scrollTop = 0;

  // Init after render
  if (view.init) view.init();
  currentView = viewId;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  const tc = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="flex:1">${msg}</span>
    <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  tc.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
  return el;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function showModal(titleText, bodyHtml, footerHtml = '') {
  const mc = document.getElementById('modal-container');
  const bd = document.getElementById('modal-backdrop');
  mc.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${titleText}</span>
        <button class="btn-icon" onclick="closeModal()">
          <i class="ri-close-line" style="font-size:18px"></i>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  mc.classList.remove('hidden');
  bd.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-container').classList.add('hidden');
  document.getElementById('modal-backdrop').classList.add('hidden');
}

// Close modal on backdrop click
document.getElementById('modal-backdrop').addEventListener('click', closeModal);

// ─── Formatting helpers ───────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  return str.split(' ')[0];
}

function fmtTime(str) {
  if (!str) return '—';
  const parts = str.split(' ');
  return parts[1] ? parts[1].substring(0,5) : parts[0];
}

function fmtDatetime(str) {
  if (!str) return '—';
  return str.substring(0, 16).replace('T', ' ');
}

function fmtHours(h) {
  if (h == null) return '—';
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
}

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}
function prevMonthStart() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1);
  return d.toISOString().split('T')[0];
}
function prevMonthEnd() {
  const d = new Date(); d.setDate(0);
  return d.toISOString().split('T')[0];
}
function weekStart() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().split('T')[0];
}

function punchLabel(type) {
  const labels = { 0:'Entrada', 1:'Salida', 2:'Salida Descanso', 3:'Retorno Descanso', 4:'Extra Entrada', 5:'Extra Salida' };
  return labels[type] || `Tipo ${type}`;
}

function punchBadge(type) {
  const cfg = {
    0: ['Entrada',        'badge-green'],
    1: ['Salida',         'badge-blue'],
    2: ['Sal. Descanso',  'badge-orange'],
    3: ['Ret. Descanso',  'badge-orange'],
    4: ['Extra Entrada',  'badge-purple'],
    5: ['Extra Salida',   'badge-purple'],
  };
  const [label, cls] = cfg[type] || [`Tipo ${type}`, 'badge-gray'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Sync progress overlay ────────────────────────────────────────────────────
let _syncBusy = false;

function setSyncStatus(state, text) {
  const dot  = document.getElementById('status-dot');
  const lbl  = document.getElementById('status-text');
  dot.className = `status-dot ${state}`;
  lbl.textContent = text;
  _syncBusy = state === 'syncing';
  document.getElementById('btn-quick-sync').disabled = _syncBusy;
}

// ─── Quick sync ───────────────────────────────────────────────────────────────
async function quickSync() {
  if (_syncBusy) return;
  setSyncStatus('syncing', 'Sincronizando...');
  try {
    const result = await window.api.downloadAttendance({
      dateFrom: monthStart(),
      dateTo:   today(),
    });
    setSyncStatus('ok', `Listo (${result.totalNew} nuevos)`);
    toast(`Sincronización completa: ${result.totalNew} registros nuevos`, 'success');
    // Refresh current view if it cares
    if (currentView === 'dashboard')  navigate('dashboard');
    if (currentView === 'attendance') navigate('attendance');
  } catch(err) {
    setSyncStatus('error', 'Error al sincronizar');
    toast(`Error al sincronizar: ${err.message}`, 'error');
  }
}

document.getElementById('btn-quick-sync').addEventListener('click', quickSync);

// Listen for streaming sync log (from download initiated inside devices/sync views)
window.api.onSyncLog(({ level, msg }) => {
  // Forward to log boxes in active view
  document.querySelectorAll('.log-box').forEach(box => {
    const line = document.createElement('div');
    line.className = `log-line ${level || 'info'}`;
    const time = new Date().toTimeString().substring(0,8);
    line.textContent = `[${time}] ${msg}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  });
});

window.api.onSyncDone(result => {
  setSyncStatus('ok', `${result.totalNew} nuevos`);
});

// ─── Nav click handlers ───────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigate(el.dataset.view);
  });
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ─── Sort utility ─────────────────────────────────────────────────────────────
function sortData(arr, key, dir) {
  return [...arr].sort((a, b) => {
    let va = a[key] ?? '', vb = b[key] ?? '';
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
    return dir === 'desc' ? -cmp : cmp;
  });
}

// ─── Expose globals for views ─────────────────────────────────────────────────
window.App = {
  navigate, toast, showModal, closeModal,
  fmtDate, fmtTime, fmtDatetime, fmtHours,
  today, monthStart, prevMonthStart, prevMonthEnd, weekStart,
  punchLabel, punchBadge,
  setSyncStatus,
  sortData,
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
navigate('dashboard');
