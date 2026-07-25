window.EmployeesView = {
  _employees:      [],
  _search:         '',
  _sortKey:        'effective_name',
  _sortDir:        'asc',
  _showArchived:   false,

  // Day-of-week helpers (0=Sun…6=Sat)
  _DAY_ORDER: [1,2,3,4,5,6,0],
  _DAY_NAMES: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],

  render() {
    return `
    <div>
      <div class="section-header mb-16">
        <div>
          <div class="section-title">Empleados</div>
          <div class="section-sub">Lista de empleados detectados en los dispositivos biométricos</div>
        </div>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" onclick="EmployeesView._importExcel()">
            <i class="ri-file-excel-2-line"></i> Importar Excel
          </button>
          <button class="btn btn-ghost btn-sm" onclick="EmployeesView._exportExcel()">
            <i class="ri-download-2-line"></i> Exportar Excel
          </button>
          <button class="btn btn-ghost btn-sm" onclick="EmployeesView._syncFromDevice()">
            <i class="ri-download-cloud-line"></i> Desde dispositivo
          </button>
        </div>
      </div>

      <div class="filter-bar mb-16">
        <div class="form-group">
          <label class="form-label">Buscar</label>
          <input class="form-control" id="emp-search" type="search" placeholder="Nombre, alias, ID, departamento..."
            value="${this._search}" oninput="EmployeesView._onSearch(this.value)">
        </div>
        <div class="form-group" style="align-self:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="EmployeesView._clearSearch()">Limpiar</button>
        </div>
        <div class="form-group" style="align-self:flex-end">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text2)">
            <input type="checkbox" id="emp-show-archived" ${this._showArchived ? 'checked' : ''}
              onchange="EmployeesView._toggleArchived(this.checked)">
            Mostrar archivados
          </label>
        </div>
        <div class="form-group" style="align-self:flex-end;margin-left:auto">
          <span class="text-sm text-muted" id="emp-count">—</span>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${this._th('zk_id',        'ID Biómetro')}
              ${this._th('effective_name','Nombre / Alias')}
              ${this._th('department',   'Departamento')}
              ${this._th('position',     'Cargo')}
              ${this._th('hours_per_day','Hrs/día')}
              ${this._th('start_time',   'Entrada')}
              ${this._th('end_time',     'Salida')}
              ${this._th('device_name',  'Dispositivo')}
              ${this._th('enabled',      'Estado')}
              <th></th>
            </tr>
          </thead>
          <tbody id="emp-tbody"></tbody>
        </table>
      </div>

      <div id="emp-empty" class="empty-state hidden">
        <i class="ri-team-line"></i>
        <h3>Sin empleados</h3>
        <p>Agrega un dispositivo y usa "Desde dispositivo" para cargar los empleados registrados en el biométrico, o importa desde Excel.</p>
        <button class="btn btn-primary" onclick="App.navigate('devices')">
          <i class="ri-router-line"></i> Ir a Dispositivos
        </button>
      </div>
    </div>`;
  },

  _th(key, label) {
    const active = this._sortKey === key;
    const cls = `th-sort${active ? ' ' + this._sortDir : ''}`;
    return `<th class="${cls}" onclick="EmployeesView._sort('${key}')">${label}<span class="sort-arrow"></span></th>`;
  },

  async init() { await this._load(); },

  async _load() {
    this._employees = await window.api.getEmployees(this._showArchived);
    this._render();
  },

  _onSearch(val) { this._search = val; this._render(); },

  _clearSearch() {
    this._search = '';
    const el = document.getElementById('emp-search');
    if (el) el.value = '';
    this._render();
  },

  _toggleArchived(val) {
    this._showArchived = val;
    this._load();
  },

  _sort(key) {
    if (this._sortKey === key) this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    else { this._sortKey = key; this._sortDir = 'asc'; }
    this._render();
  },

  _filtered() {
    const q = this._search.toLowerCase();
    let list = this._employees.filter(e =>
      !q ||
      (e.effective_name||'').toLowerCase().includes(q) ||
      (e.display_name||'').toLowerCase().includes(q) ||
      (e.name||'').toLowerCase().includes(q) ||
      String(e.zk_id).includes(q) ||
      (e.department||'').toLowerCase().includes(q) ||
      (e.position||'').toLowerCase().includes(q)
    );
    return App.sortData(list, this._sortKey, this._sortDir);
  },

  _render() {
    const tbody = document.getElementById('emp-tbody');
    const empty = document.getElementById('emp-empty');
    const count = document.getElementById('emp-count');
    if (!tbody) return;

    const list = this._filtered();
    if (count) count.textContent = `${list.length} empleado${list.length !== 1 ? 's' : ''}`;

    if (list.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    tbody.innerHTML = list.map(e => {
      const hasAlias = e.display_name && e.display_name.trim();
      const nameCell = hasAlias
        ? `<div class="emp-display">${e.display_name}</div><div class="emp-bio">${e.name}</div>`
        : `<div class="emp-display">${e.name}</div>`;

      let statusBadge;
      if (e.archived) {
        statusBadge = '<span class="badge badge-gray">Archivado</span>';
      } else if (e.enabled) {
        statusBadge = '<span class="badge badge-green">Activo</span>';
      } else {
        statusBadge = '<span class="badge badge-orange">Inactivo</span>';
      }

      const rowStyle = e.archived ? 'style="opacity:0.55"' : '';

      return `
      <tr ${rowStyle}>
        <td><span class="badge badge-gray">${e.zk_id}</span></td>
        <td style="min-width:160px">${nameCell}</td>
        <td>${e.department || '<span class="text-muted">—</span>'}</td>
        <td>${e.position  || '<span class="text-muted">—</span>'}</td>
        <td class="num-cell">${e.hours_per_day}</td>
        <td><span class="badge badge-blue">${e.start_time || '08:00'}</span></td>
        <td><span class="badge badge-green">${e.end_time || '17:00'}</span></td>
        <td><span class="text-sm text-muted">${e.device_name || '—'}</span></td>
        <td>${statusBadge}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Editar" onclick="EmployeesView._editModal('${e.zk_id}','${e.device_id}')">
            <i class="ri-edit-line"></i>
          </button>
          <button class="btn btn-ghost btn-sm" title="Ver asistencia" onclick="App.navigate('attendance'); setTimeout(()=>AttendanceView._filterByEmployee('${e.zk_id}|${e.device_id}'),200)">
            <i class="ri-time-line"></i>
          </button>
        </td>
      </tr>`;
    }).join('');
  },

  async _exportExcel() {
    try {
      const r = await window.api.exportEmployeesExcel();
      if (r?.saved) App.toast(`Exportado: ${r.path}`, 'success');
    } catch(err) { App.toast(err.message, 'error'); }
  },

  async _importExcel() {
    App.showModal('Importar empleados desde Excel', `
      <div class="form-group">
        <label class="form-label">Modo de importación</label>
        <select class="form-control" id="imp-emp-mode">
          <option value="new">Solo agregar nuevos (no modifica existentes)</option>
          <option value="update">Agregar y actualizar existentes</option>
        </select>
        <div class="form-hint">Los registros se identifican por "ID Biómetro + Dispositivo ID".</div>
      </div>
      <div class="form-group">
        <label class="form-label">Archivo Excel</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="EmployeesView._pickFile('imp-emp-path')">
            <i class="ri-folder-open-line"></i> Seleccionar archivo
          </button>
          <span id="imp-emp-path-label" class="text-sm text-muted">Ningún archivo seleccionado</span>
          <input type="hidden" id="imp-emp-path">
        </div>
        <div class="form-hint">Usa "Exportar Excel" para obtener la plantilla con el formato correcto.</div>
      </div>
      <div id="imp-emp-result"></div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="btn-do-imp-emp" onclick="EmployeesView._doImport()">
        <i class="ri-upload-2-line"></i> Importar
      </button>
    `);
  },

  async _pickFile(inputId) {
    const filePath = await window.api.openFileDialog({
      title: 'Seleccionar archivo Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    });
    if (!filePath) return;
    const input = document.getElementById(inputId);
    const label = document.getElementById(`${inputId}-label`);
    if (input) input.value = filePath;
    if (label) label.textContent = filePath.split(/[\\/]/).pop();
  },

  async _doImport() {
    const filePath = document.getElementById('imp-emp-path')?.value;
    if (!filePath) { App.toast('Selecciona un archivo Excel', 'warning'); return; }
    const mode = document.getElementById('imp-emp-mode')?.value;
    const btn  = document.getElementById('btn-do-imp-emp');
    const res  = document.getElementById('imp-emp-result');
    btn.disabled = true;
    try {
      const r = await window.api.importEmployeesExcel({ filePath, mode });
      res.innerHTML = `<div class="import-result">
        ✅ <strong>${r.imported}</strong> registros importados
        ${r.skipped ? ` · ${r.skipped} omitidos` : ''}
        ${r.errors  ? ` · ⚠ ${r.errors} errores` : ''}
      </div>`;
      App.toast(`${r.imported} empleados importados`, 'success');
      await this._load();
    } catch(err) {
      res.innerHTML = `<div class="import-result" style="border-color:var(--error)">❌ ${err.message}</div>`;
      btn.disabled = false;
    }
  },

  async _syncFromDevice() {
    const devices = await window.api.getDevices();
    if (devices.length === 0) { App.toast('No hay dispositivos configurados', 'warning'); App.navigate('devices'); return; }
    const opts = devices.map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`).join('');
    App.showModal('Importar empleados desde dispositivo', `
      <div class="form-group">
        <label class="form-label">Seleccionar dispositivo</label>
        <select class="form-control" id="sync-dev-sel">${opts}</select>
      </div>
      <div id="sync-user-status" class="text-muted text-sm" style="margin-top:8px"></div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="btn-do-sync-users" onclick="EmployeesView._doSyncUsers()">
        <i class="ri-download-cloud-line"></i> Importar
      </button>
    `);
  },

  async _doSyncUsers() {
    const sel    = document.getElementById('sync-dev-sel');
    const btn    = document.getElementById('btn-do-sync-users');
    const status = document.getElementById('sync-user-status');
    btn.disabled = true;
    status.textContent = 'Conectando al dispositivo...';
    try {
      const users = await window.api.syncEmployeesFromDevice(sel.value);
      const count = Array.isArray(users) ? users.length : (users?.users?.length ?? 0);
      status.textContent = `${count} empleados importados correctamente.`;
      btn.innerHTML = '<i class="ri-check-line"></i> Cerrar';
      btn.onclick = () => { App.closeModal(); EmployeesView._load(); };
      App.toast(`${count} empleados importados`, 'success');
    } catch(err) {
      status.textContent = `Error: ${err.message}`;
      btn.disabled = false;
    }
  },

  // ── Edit modal ─────────────────────────────────────────────────────────────
  async _editModal(zkId, deviceId) {
    const emp = this._employees.find(e => e.zk_id === zkId && e.device_id === deviceId);
    if (!emp) return;

    // Load per-day schedules
    let daySchedules = [];
    try { daySchedules = await window.api.getEmployeeSchedules(zkId, deviceId); } catch (_) {}
    const hasCustom = daySchedules.length > 0;

    const id = `${zkId}|${deviceId}`;
    const schedGrid = this._buildScheduleGrid(emp, daySchedules, hasCustom);

    App.showModal(`Editar — ${emp.effective_name || emp.name}`, `
      <div class="form-group">
        <label class="form-label">Alias / Nombre personalizado</label>
        <input class="form-control" id="edit-display" value="${emp.display_name || ''}" placeholder="Ej: Juan García">
        <div class="form-hint">Nombre visible en la app. Nombre biómetro: <strong>${emp.name}</strong></div>
      </div>
      <div class="divider"></div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Departamento</label>
          <input class="form-control" id="edit-dept" value="${emp.department || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Cargo / Puesto</label>
          <input class="form-control" id="edit-pos" value="${emp.position || ''}">
        </div>
      </div>
      <div class="divider"></div>

      <!-- Schedule section -->
      <div class="form-group mb-8">
        <label class="form-label" style="margin-bottom:8px">Tipo de horario</label>
        <div style="display:flex;gap:16px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="sched-type" value="single" ${!hasCustom ? 'checked' : ''}
              onchange="EmployeesView._onSchedTypeChange('single')">
            Mismo horario todos los días
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="sched-type" value="custom" ${hasCustom ? 'checked' : ''}
              onchange="EmployeesView._onSchedTypeChange('custom')">
            Horario personalizado por día
          </label>
        </div>
      </div>

      <!-- Single schedule -->
      <div id="sched-single" ${hasCustom ? 'style="display:none"' : ''}>
        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr 1fr">
          <div class="form-group">
            <label class="form-label">Horas por día</label>
            <input class="form-control" id="edit-hpd" type="number" step="0.5" min="0.5" max="24" value="${emp.hours_per_day || 8}">
          </div>
          <div class="form-group">
            <label class="form-label">Hora entrada</label>
            <input class="form-control" id="edit-start" type="time" value="${emp.start_time || '08:00'}">
          </div>
          <div class="form-group">
            <label class="form-label">Hora salida</label>
            <input class="form-control" id="edit-end" type="time" value="${emp.end_time || '17:00'}">
          </div>
          <div class="form-group">
            <label class="form-label">Tolerancia (min)</label>
            <input class="form-control" id="edit-tol" type="number" min="0" max="120" value="${emp.tolerance_min ?? 10}">
          </div>
        </div>
      </div>

      <!-- Custom per-day schedule -->
      <div id="sched-custom" ${!hasCustom ? 'style="display:none"' : ''}>
        ${schedGrid}
      </div>

      <div class="divider"></div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" id="edit-enabled">
            <option value="1" ${emp.enabled && !emp.archived ? 'selected' : ''}>Activo</option>
            <option value="0" ${!emp.enabled && !emp.archived ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>
        <div class="form-group" style="align-self:flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding-bottom:6px">
            <input type="checkbox" id="edit-night-shift" ${emp.night_shift ? 'checked' : ''}>
            <span>
              <strong>Turno nocturno</strong>
              <span class="form-hint" style="margin:0;display:block">Marcaciones antes de las 14:00 se agrupan con el turno anterior</span>
            </span>
          </label>
        </div>
      </div>
    `, `
      <button class="btn btn-ghost" style="margin-right:auto;color:var(--error)" onclick="EmployeesView._confirmDelete('${zkId}','${deviceId}')">
        <i class="ri-delete-bin-line"></i> Eliminar
      </button>
      ${emp.archived
        ? `<button class="btn btn-ghost" onclick="EmployeesView._unarchive('${zkId}','${deviceId}')"><i class="ri-inbox-unarchive-line"></i> Restaurar</button>`
        : `<button class="btn btn-ghost" onclick="EmployeesView._archive('${zkId}','${deviceId}')"><i class="ri-archive-line"></i> Archivar</button>`
      }
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="EmployeesView._saveEdit('${id}','${zkId}','${deviceId}','${emp.name.replace(/'/g,"\\'")}')">
        <i class="ri-save-line"></i> Guardar
      </button>
    `);
  },

  _buildScheduleGrid(emp, daySchedules, hasCustom) {
    const schedMap = {};
    for (const s of daySchedules) schedMap[s.day_of_week] = s;

    const rows = this._DAY_ORDER.map(dow => {
      const s = schedMap[dow] || {
        start_time:    emp.start_time    || '08:00',
        end_time:      emp.end_time      || '17:00',
        hours_per_day: emp.hours_per_day || 8,
        tolerance_min: emp.tolerance_min ?? 10,
        is_work_day:   [1,2,3,4,5].includes(dow) ? 1 : 0,
      };
      const isWork = s.is_work_day ? 'checked' : '';
      const dim = !s.is_work_day ? 'style="opacity:0.4"' : '';
      return `
        <tr id="sched-row-${dow}" ${dim}>
          <td style="white-space:nowrap;font-weight:500">${this._DAY_NAMES[dow]}</td>
          <td style="text-align:center">
            <input type="checkbox" ${isWork} data-dow="${dow}" class="sched-workday"
              onchange="EmployeesView._onWorkdayChange(${dow},this.checked)">
          </td>
          <td><input class="form-control" style="width:90px" type="time" id="sched-start-${dow}" value="${s.start_time || '08:00'}"></td>
          <td><input class="form-control" style="width:90px" type="time" id="sched-end-${dow}"   value="${s.end_time   || '17:00'}"></td>
          <td><input class="form-control" style="width:70px" type="number" step="0.5" min="0.5" max="24" id="sched-hpd-${dow}" value="${s.hours_per_day || 8}"></td>
          <td><input class="form-control" style="width:70px" type="number" min="0" max="120" id="sched-tol-${dow}" value="${s.tolerance_min ?? 10}"></td>
        </tr>`;
    }).join('');

    return `
      <div style="overflow-x:auto">
        <table style="width:100%;font-size:13px">
          <thead>
            <tr style="color:var(--text3)">
              <th style="text-align:left;padding:4px 8px 4px 0">Día</th>
              <th style="text-align:center;padding:4px 8px">Laboral</th>
              <th style="padding:4px 8px">Entrada</th>
              <th style="padding:4px 8px">Salida</th>
              <th style="padding:4px 8px">Hrs/día</th>
              <th style="padding:4px 8px">Tolerancia</th>
            </tr>
          </thead>
          <tbody id="sched-tbody">${rows}</tbody>
        </table>
      </div>
      <div class="form-hint" style="margin-top:6px">Desactiva "Laboral" para los días libres de este trabajador.</div>`;
  },

  _onSchedTypeChange(type) {
    const single = document.getElementById('sched-single');
    const custom = document.getElementById('sched-custom');
    if (!single || !custom) return;
    single.style.display = type === 'single' ? '' : 'none';
    custom.style.display = type === 'custom' ? '' : 'none';
  },

  _onWorkdayChange(dow, isWork) {
    const row = document.getElementById(`sched-row-${dow}`);
    if (row) row.style.opacity = isWork ? '1' : '0.4';
  },

  async _saveEdit(id, zkId, deviceId, bioName) {
    const schedType = document.querySelector('input[name="sched-type"]:checked')?.value || 'single';

    // Read single-schedule fields
    const tolVal = parseInt(document.getElementById('edit-tol')?.value);
    const hpdVal = parseFloat(document.getElementById('edit-hpd')?.value);

    const data = {
      display_name:  document.getElementById('edit-display').value.trim(),
      name:          bioName,
      department:    document.getElementById('edit-dept').value.trim(),
      position:      document.getElementById('edit-pos').value.trim(),
      hours_per_day: isNaN(hpdVal) ? 8 : hpdVal,
      start_time:    document.getElementById('edit-start')?.value || '08:00',
      end_time:      document.getElementById('edit-end')?.value   || '17:00',
      tolerance_min: isNaN(tolVal) ? 10 : tolVal,
      enabled:       document.getElementById('edit-enabled').value === '1',
      night_shift:   document.getElementById('edit-night-shift')?.checked ? 1 : 0,
    };

    // Save per-day schedules
    let daySchedules = [];
    if (schedType === 'custom') {
      for (const dow of this._DAY_ORDER) {
        const workdayEl = document.querySelector(`.sched-workday[data-dow="${dow}"]`);
        const startEl   = document.getElementById(`sched-start-${dow}`);
        const endEl     = document.getElementById(`sched-end-${dow}`);
        const hpdEl     = document.getElementById(`sched-hpd-${dow}`);
        const tolEl     = document.getElementById(`sched-tol-${dow}`);
        if (!workdayEl) continue;
        const tolDay = parseInt(tolEl?.value);
        const hpdDay = parseFloat(hpdEl?.value);
        daySchedules.push({
          day_of_week:   dow,
          is_work_day:   workdayEl.checked ? 1 : 0,
          start_time:    startEl?.value || '08:00',
          end_time:      endEl?.value   || '17:00',
          hours_per_day: isNaN(hpdDay) ? 8 : hpdDay,
          tolerance_min: isNaN(tolDay) ? 10 : tolDay,
        });
      }
    }

    try {
      await window.api.updateEmployee(id, data);
      await window.api.setEmployeeSchedules(zkId, deviceId, daySchedules);
      App.closeModal();
      App.toast('Empleado actualizado', 'success');
      await this._load();
    } catch(err) {
      App.toast(`Error al guardar: ${err.message}`, 'error');
    }
  },

  // ── Archive / Delete ────────────────────────────────────────────────────────
  async _archive(zkId, deviceId) {
    await window.api.archiveEmployee(zkId, deviceId);
    App.closeModal();
    App.toast('Empleado archivado', 'success');
    await this._load();
  },

  async _unarchive(zkId, deviceId) {
    await window.api.unarchiveEmployee(zkId, deviceId);
    App.closeModal();
    App.toast('Empleado restaurado', 'success');
    await this._load();
  },

  _confirmDelete(zkId, deviceId) {
    const emp = this._employees.find(e => e.zk_id === zkId && e.device_id === deviceId);
    const name = emp?.effective_name || emp?.name || `ID ${zkId}`;
    App.showModal('Eliminar empleado', `
      <div style="padding:8px 0">
        <p style="margin-bottom:12px">¿Eliminar permanentemente a <strong>${name}</strong>?</p>
        <div style="background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.2);padding:10px 14px;font-size:13px;color:var(--error)">
          Esta acción no se puede deshacer. Los registros de asistencia se mantendrán pero el perfil del empleado será eliminado.
        </div>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn" style="background:var(--error);color:#fff" onclick="EmployeesView._doDelete('${zkId}','${deviceId}')">
        <i class="ri-delete-bin-line"></i> Eliminar definitivamente
      </button>
    `);
  },

  async _doDelete(zkId, deviceId) {
    try {
      await window.api.deleteEmployee(zkId, deviceId);
      App.closeModal();
      App.toast('Empleado eliminado', 'success');
      await this._load();
    } catch(err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },
};
