window.DevicesView = {
  _devices: [],

  render() {
    return `
    <div>
      <div class="section-header mb-16">
        <div>
          <div class="section-title">Dispositivos ZKTeco</div>
          <div class="section-sub">Gestión de relojes biométricos en red</div>
        </div>
        <div class="section-actions">
          <button class="btn btn-primary btn-sm" onclick="DevicesView._addModal()">
            <i class="ri-add-line"></i> Agregar dispositivo
          </button>
        </div>
      </div>

      <div id="dev-list"></div>

      <div id="dev-empty" class="empty-state hidden">
        <i class="ri-router-line"></i>
        <h3>Sin dispositivos configurados</h3>
        <p>Agrega un dispositivo ZKTeco K30 para comenzar a descargar registros de asistencia.</p>
        <button class="btn btn-primary" onclick="DevicesView._addModal()">
          <i class="ri-add-line"></i> Agregar primer dispositivo
        </button>
      </div>

      <!-- Sync section -->
      <div class="card" style="margin-top:24px" id="dev-sync-card">
        <div class="card-title mb-12">Sincronización manual</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:flex-end;margin-bottom:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Desde</label>
            <input class="form-control" id="sync-from" type="date" value="${App.monthStart()}">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Hasta</label>
            <input class="form-control" id="sync-to" type="date" value="${App.today()}">
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._quickSync('today')">Hoy</button>
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._quickSync('week')">Semana</button>
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._quickSync('month')">Mes</button>
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._quickSync('prev')">Mes ant.</button>
          </div>
          <div>
            <button class="btn btn-primary w-full" id="btn-do-sync" onclick="DevicesView._doSync()">
              <i class="ri-refresh-line"></i> Descargar registros
            </button>
          </div>
        </div>
        <div id="sync-progress" class="progress hidden" style="margin-bottom:8px">
          <div class="progress-bar indeterminate"></div>
        </div>
        <div id="sync-result" class="text-sm text-muted" style="margin-bottom:8px"></div>
        <div class="log-box" id="dev-log"></div>
      </div>
    </div>`;
  },

  async init() {
    await this._load();
  },

  async _load() {
    this._devices = await window.api.getDevices();
    this._renderList();
  },

  _renderList() {
    const container = document.getElementById('dev-list');
    const empty     = document.getElementById('dev-empty');
    if (!container) return;

    if (!this._devices.length) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    container.innerHTML = this._devices.map(d => `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="display:flex;gap:14px;align-items:center">
            <div style="width:42px;height:42px;background:var(--primary-l);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px;color:var(--primary)">
              <i class="ri-router-line"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--text)">${d.name}</div>
              <div class="text-sm text-muted">${d.ip}:${d.port} &nbsp;·&nbsp; Contraseña: ${d.password || '(ninguna)'} &nbsp;·&nbsp; Timeout: ${d.timeout}s</div>
              <div id="dev-status-${d.id}" class="text-sm" style="margin-top:3px;color:var(--text3)">Sin probar</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._test('${d.id}')">
              <i class="ri-wifi-line"></i> Probar
            </button>
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._editModal('${d.id}')">
              <i class="ri-edit-line"></i> Editar
            </button>
            <button class="btn btn-ghost btn-sm" onclick="DevicesView._importUsers('${d.id}')">
              <i class="ri-download-cloud-line"></i> Importar empleados
            </button>
            <button class="btn btn-danger btn-sm" onclick="DevicesView._delete('${d.id}', '${d.name}')">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </div>
      </div>`).join('');
  },

  async _test(id) {
    const device   = this._devices.find(d => d.id === id);
    const statusEl = document.getElementById(`dev-status-${id}`);
    if (!device || !statusEl) return;
    statusEl.style.color = 'var(--warning)';
    statusEl.textContent = 'Probando conexión...';
    try {
      const info = await window.api.testDevice(device);
      statusEl.style.color = 'var(--success)';
      statusEl.textContent = `✓ Conectado — ${info.firmware} — Usuarios: ${info.users}`;
    } catch(err) {
      statusEl.style.color = 'var(--error)';
      statusEl.textContent = `✗ Error: ${err.message}`;
    }
  },

  _addModal() {
    App.showModal('Agregar dispositivo ZKTeco', this._deviceForm({}), `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-ghost btn-sm" onclick="DevicesView._testForm()">
        <i class="ri-wifi-line"></i> Probar conexión
      </button>
      <button class="btn btn-primary" onclick="DevicesView._saveAdd()">
        <i class="ri-add-line"></i> Agregar
      </button>
    `);
  },

  _editModal(id) {
    const device = this._devices.find(d => d.id === id);
    if (!device) return;
    App.showModal(`Editar — ${device.name}`, this._deviceForm(device), `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-ghost btn-sm" onclick="DevicesView._testForm()">
        <i class="ri-wifi-line"></i> Probar conexión
      </button>
      <button class="btn btn-primary" onclick="DevicesView._saveEdit('${id}')">
        <i class="ri-save-line"></i> Guardar
      </button>
    `);
  },

  _deviceForm(d) {
    return `
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Nombre *</label>
          <input class="form-control" id="df-name" placeholder="Ej: Reloj Entrada Principal" value="${d.name||''}">
        </div>
        <div class="form-group">
          <label class="form-label">IP del dispositivo *</label>
          <input class="form-control" id="df-ip" placeholder="192.168.1.100" value="${d.ip||''}">
        </div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group">
          <label class="form-label">Puerto</label>
          <input class="form-control" id="df-port" type="number" value="${d.port||4370}">
          <div class="form-hint">Por defecto: 4370</div>
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input class="form-control" id="df-pass" type="number" value="${d.password||0}">
          <div class="form-hint">0 = sin contraseña</div>
        </div>
        <div class="form-group">
          <label class="form-label">Timeout (seg)</label>
          <input class="form-control" id="df-timeout" type="number" value="${d.timeout||60}">
        </div>
      </div>
      <div id="df-test-result" class="text-sm" style="margin-top:4px;min-height:18px"></div>`;
  },

  _readForm() {
    const name = document.getElementById('df-name').value.trim();
    const ip   = document.getElementById('df-ip').value.trim();
    if (!name || !ip) { App.toast('Nombre e IP son requeridos', 'error'); return null; }
    return {
      name, ip,
      port:     parseInt(document.getElementById('df-port').value)    || 4370,
      password: parseInt(document.getElementById('df-pass').value)    || 0,
      timeout:  parseInt(document.getElementById('df-timeout').value) || 60,
      enabled:  true,
    };
  },

  async _testForm() {
    const d = this._readForm();
    if (!d) return;
    const res = document.getElementById('df-test-result');
    res.style.color = 'var(--warning)';
    res.textContent = 'Probando...';
    try {
      const info = await window.api.testDevice(d);
      res.style.color = 'var(--success)';
      res.textContent = `✓ Conexión exitosa — ${info.firmware} — Usuarios: ${info.users}`;
    } catch(err) {
      res.style.color = 'var(--error)';
      res.textContent = `✗ ${err.message}`;
    }
  },

  async _saveAdd() {
    const d = this._readForm();
    if (!d) return;
    await window.api.addDevice(d);
    App.closeModal();
    App.toast(`Dispositivo "${d.name}" agregado`, 'success');
    await this._load();
  },

  async _saveEdit(id) {
    const d = this._readForm();
    if (!d) return;
    await window.api.updateDevice(id, d);
    App.closeModal();
    App.toast('Dispositivo actualizado', 'success');
    await this._load();
  },

  async _delete(id, name) {
    App.showModal('Eliminar dispositivo', `
      <p>¿Eliminar <strong>${name}</strong>?</p>
      <p class="text-muted text-sm" style="margin-top:8px">Los registros de asistencia descargados se conservan.</p>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-danger" onclick="DevicesView._confirmDelete('${id}')">
        <i class="ri-delete-bin-line"></i> Eliminar
      </button>
    `);
  },

  async _confirmDelete(id) {
    await window.api.deleteDevice(id);
    App.closeModal();
    App.toast('Dispositivo eliminado', 'info');
    await this._load();
  },

  async _importUsers(deviceId) {
    const statusEl = document.getElementById(`dev-status-${deviceId}`);
    if (statusEl) { statusEl.style.color = 'var(--warning)'; statusEl.textContent = 'Importando empleados...'; }
    try {
      const users = await window.api.syncEmployeesFromDevice(deviceId);
      if (statusEl) { statusEl.style.color = 'var(--success)'; statusEl.textContent = `✓ ${users.length} empleados importados`; }
      App.toast(`${users.length} empleados importados`, 'success');
    } catch(err) {
      if (statusEl) { statusEl.style.color = 'var(--error)'; statusEl.textContent = `✗ ${err.message}`; }
      App.toast(err.message, 'error');
    }
  },

  _quickSync(range) {
    let from, to;
    switch(range) {
      case 'today': from = to = App.today(); break;
      case 'week':  from = App.weekStart(); to = App.today(); break;
      case 'month': from = App.monthStart(); to = App.today(); break;
      case 'prev':  from = App.prevMonthStart(); to = App.prevMonthEnd(); break;
    }
    document.getElementById('sync-from').value = from;
    document.getElementById('sync-to').value   = to;
  },

  async _doSync() {
    const btn  = document.getElementById('btn-do-sync');
    const prog = document.getElementById('sync-progress');
    const res  = document.getElementById('sync-result');
    const log  = document.getElementById('dev-log');

    btn.disabled = true;
    prog.classList.remove('hidden');
    res.textContent = '';
    if (log) log.innerHTML = '';
    App.setSyncStatus('syncing', 'Sincronizando...');

    const dateFrom = document.getElementById('sync-from').value;
    const dateTo   = document.getElementById('sync-to').value;

    try {
      const result = await window.api.downloadAttendance({ dateFrom, dateTo });
      prog.classList.add('hidden');
      App.setSyncStatus('ok', `${result.totalNew} nuevos`);
      res.textContent = `✓ Descargados: ${result.totalDownloaded} | Nuevos: ${result.totalNew}`;
      res.style.color = 'var(--success)';
      App.toast(`${result.totalNew} nuevos registros descargados`, 'success');
    } catch(err) {
      prog.classList.add('hidden');
      App.setSyncStatus('error', 'Error');
      res.textContent = `Error: ${err.message}`;
      res.style.color = 'var(--error)';
    } finally {
      btn.disabled = false;
    }
  },
};
