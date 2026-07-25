window.DashboardView = {
  _chart: null,

  render() {
    return `
    <div>
      <div class="section-header mb-24">
        <div>
          <div class="section-title">Dashboard</div>
          <div class="section-sub">Resumen general del sistema de asistencia</div>
        </div>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('attendance')">
            <i class="ri-time-line"></i> Ver registros
          </button>
          <button class="btn btn-primary btn-sm" id="dash-sync-btn" onclick="DashboardView._sync()">
            <i class="ri-refresh-line"></i> Sincronizar ahora
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-blue">
          <i class="kpi-icon ri-team-line"></i>
          <div class="kpi-label">Empleados</div>
          <div class="kpi-value" id="kpi-emp">—</div>
          <div class="kpi-sub">activos</div>
        </div>
        <div class="kpi-card kpi-green">
          <i class="kpi-icon ri-time-line"></i>
          <div class="kpi-label">Marcaciones Hoy</div>
          <div class="kpi-value" id="kpi-today">—</div>
          <div class="kpi-sub">registros</div>
        </div>
        <div class="kpi-card kpi-orange">
          <i class="kpi-icon ri-router-line"></i>
          <div class="kpi-label">Dispositivos</div>
          <div class="kpi-value" id="kpi-dev">—</div>
          <div class="kpi-sub">configurados</div>
        </div>
        <div class="kpi-card kpi-purple">
          <i class="kpi-icon ri-database-2-line"></i>
          <div class="kpi-label">Total Registros</div>
          <div class="kpi-value" id="kpi-total">—</div>
          <div class="kpi-sub" id="kpi-sync">—</div>
        </div>
      </div>

      <!-- Chart + acciones rápidas -->
      <div class="grid-2 mb-24">
        <div class="chart-wrap">
          <div class="card-title mb-8">Asistencia — últimos 14 días</div>
          <canvas id="att-chart"></canvas>
        </div>
        <div class="card">
          <div class="card-title mb-12">Acciones rápidas</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-ghost" onclick="App.navigate('attendance')">
              <i class="ri-time-line"></i> Ver últimas asistencias
            </button>
            <button class="btn btn-ghost" onclick="App.navigate('reports')">
              <i class="ri-file-chart-line"></i> Calcular planilla del mes
            </button>
            <button class="btn btn-ghost" onclick="App.navigate('employees')">
              <i class="ri-team-line"></i> Gestionar empleados
            </button>
            <button class="btn btn-ghost" onclick="App.navigate('devices')">
              <i class="ri-router-line"></i> Agregar dispositivo
            </button>
          </div>
        </div>
      </div>

      <!-- Sync log -->
      <div class="card">
        <div class="card-title mb-8">Registro de sincronización</div>
        <div class="log-box" id="dash-log">
          <div class="log-line info">Listo. Usa "Sincronizar ahora" para descargar registros del biométrico.</div>
        </div>
      </div>
    </div>`;
  },

  async init() {
    await this._loadStats();
    await this._loadChart();
  },

  async _loadStats() {
    try {
      const s = await window.api.getDashboardStats();
      document.getElementById('kpi-emp').textContent   = s.total_employees;
      document.getElementById('kpi-today').textContent = s.records_today;
      document.getElementById('kpi-dev').textContent   = s.total_devices;
      document.getElementById('kpi-total').textContent = s.records_total.toLocaleString();
      document.getElementById('kpi-sync').textContent  = s.last_sync
        ? `Última sync: ${s.last_sync.substring(0,16)}`
        : 'Sin sincronizar';
    } catch {}
  },

  async _loadChart() {
    try {
      const data = await window.api.getAttendanceChart();
      const canvas = document.getElementById('att-chart');
      if (!canvas) return;
      if (this._chart) this._chart.destroy();

      this._chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: data.map(r => r.day.substring(5)),
          datasets: [{
            label: 'Empleados',
            data: data.map(r => r.employees),
            backgroundColor: 'rgba(29,78,216,.18)',
            borderColor: '#1d4ed8',
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#e2e8f0' }, ticks: { color: '#9ca3af', font: { size: 11 } } },
            y: { grid: { color: '#e2e8f0' }, ticks: { color: '#9ca3af', stepSize: 1 }, beginAtZero: true },
          },
        },
      });
    } catch {}
  },

  async _sync() {
    const btn = document.getElementById('dash-sync-btn');
    if (!btn) return;
    btn.disabled = true;
    App.setSyncStatus('syncing', 'Sincronizando...');

    const log = document.getElementById('dash-log');
    if (log) log.innerHTML = '';

    try {
      const result = await window.api.downloadAttendance({
        dateFrom: App.monthStart(),
        dateTo:   App.today(),
      });
      App.setSyncStatus('ok', `${result.totalNew} nuevos`);
      App.toast(`Sincronización completa: ${result.totalNew} registros nuevos`, 'success');
      await this._loadStats();
      await this._loadChart();
    } catch(err) {
      App.setSyncStatus('error', 'Error');
      App.toast(`Error: ${err.message}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },
};

(function loadChartJs() {
  if (window.Chart) return;
  const s = document.createElement('script');
  s.src = '../node_modules/chart.js/dist/chart.umd.min.js';
  s.onerror = () => {
    const s2 = document.createElement('script');
    s2.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
})();
