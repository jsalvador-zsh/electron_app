window.AttendanceView = {
  _records:   [],
  _summary:   [],
  _page:      1,
  _pageSize:  50,
  _viewMode:  'records',
  _filters:   { dateFrom: '', dateTo: '', employeeId: '', deviceId: '', punchType: '', search: '' },
  _employees: [],
  _devices:   [],
  _sortKey:   '',
  _sortDir:   'asc',
  _sumSortKey:'',
  _sumSortDir:'asc',

  render() {
    const f = this._filters;
    return `
    <div>
      <div class="section-header mb-16">
        <div>
          <div class="section-title">Registros de Asistencia</div>
          <div class="section-sub">Historial de marcaciones y resumen diario de horas</div>
        </div>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" onclick="AttendanceView._importExcel()">
            <i class="ri-file-excel-2-line"></i> Importar Excel
          </button>
          <button class="btn btn-ghost btn-sm" id="btn-sync-att" onclick="AttendanceView._syncNow()">
            <i class="ri-refresh-line"></i> Sincronizar
          </button>
          <button class="btn btn-ghost btn-sm" id="btn-att-xlsx" onclick="AttendanceView._exportExcel()">
            <i class="ri-download-2-line"></i> Exportar Excel
          </button>
        </div>
      </div>

      <!-- View mode + page size -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div class="btn-group">
          <button id="mode-records" class="btn btn-sm active" onclick="AttendanceView._setMode('records')">
            <i class="ri-list-check"></i> Marcaciones
          </button>
          <button id="mode-summary" class="btn btn-sm" onclick="AttendanceView._setMode('summary')">
            <i class="ri-calendar-check-line"></i> Resumen Diario
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
          <span class="text-sm text-muted">Filas:</span>
          <select class="page-size-sel" onchange="AttendanceView._setPageSize(+this.value)">
            <option value="25"  ${this._pageSize===25?'selected':''}>25</option>
            <option value="50"  ${this._pageSize===50?'selected':''}>50</option>
            <option value="100" ${this._pageSize===100?'selected':''}>100</option>
            <option value="200" ${this._pageSize===200?'selected':''}>200</option>
          </select>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <div class="form-group">
          <label class="form-label">Desde</label>
          <input class="form-control" id="att-from" type="date" value="${f.dateFrom || App.monthStart()}"
            onchange="AttendanceView._setFilter('dateFrom', this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">Hasta</label>
          <input class="form-control" id="att-to" type="date" value="${f.dateTo || App.today()}"
            onchange="AttendanceView._setFilter('dateTo', this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">Empleado</label>
          <select class="form-control" id="att-emp" style="min-width:170px"
            onchange="AttendanceView._setFilter('employeeId', this.value)">
            <option value="">Todos los empleados</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Dispositivo</label>
          <select class="form-control" id="att-dev" onchange="AttendanceView._setFilter('deviceId', this.value)">
            <option value="">Todos</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo marcación</label>
          <select class="form-control" id="att-ptype" onchange="AttendanceView._setFilter('punchType', this.value)">
            <option value="">Todos</option>
            <option value="0">Entrada</option>
            <option value="1">Salida</option>
            <option value="2">Sal. Descanso</option>
            <option value="3">Ret. Descanso</option>
            <option value="4">Extra Entrada</option>
            <option value="5">Extra Salida</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Buscar</label>
          <input class="form-control" id="att-search" type="search" placeholder="Nombre o ID..."
            value="${f.search}" oninput="AttendanceView._setFilter('search', this.value)">
        </div>
        <div class="form-group" style="align-self:flex-end">
          <button class="btn btn-primary btn-sm" onclick="AttendanceView._applyFilters()">
            <i class="ri-filter-3-line"></i> Filtrar
          </button>
          <button class="btn btn-ghost btn-sm" onclick="AttendanceView._resetFilters()">Limpiar</button>
        </div>
        <div class="form-group" style="align-self:flex-end;margin-left:auto">
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" onclick="AttendanceView._quick('today')">Hoy</button>
            <button class="btn btn-ghost btn-sm" onclick="AttendanceView._quick('week')">Semana</button>
            <button class="btn btn-ghost btn-sm" onclick="AttendanceView._quick('month')">Mes</button>
            <button class="btn btn-ghost btn-sm" onclick="AttendanceView._quick('prev')">Mes ant.</button>
          </div>
        </div>
      </div>

      <div id="att-progress" class="progress mb-12 hidden"><div class="progress-bar indeterminate"></div></div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="text-sm text-muted" id="att-count">—</span>
        <div id="att-page-top" class="pagination"></div>
      </div>

      <!-- Records table -->
      <div id="att-records-view">
        <div class="table-wrap">
          <table>
            <thead>
              <tr id="att-rec-head">
                ${this._thRec('employee_name','Empleado')}
                ${this._thRec('zk_user_id',  'ID')}
                ${this._thRec('timestamp_local','Fecha')}
                <th>Hora</th>
                ${this._thRec('punch_type',  'Tipo')}
                ${this._thRec('device_name', 'Dispositivo')}
                <th style="width:80px"></th>
              </tr>
            </thead>
            <tbody id="att-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Daily summary table -->
      <div id="att-summary-view" style="display:none">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${this._thSum('employee_name','Empleado')}
                ${this._thSum('date',        'Fecha')}
                ${this._thSum('p_entry',     'Entrada')}
                ${this._thSum('p_lunch_out', 'Sal. Almuerzo')}
                ${this._thSum('p_lunch_in',  'Ret. Almuerzo')}
                ${this._thSum('p_exit',      'Salida')}
                ${this._thSum('hours_raw',   'Tiempo Bruto')}
                ${this._thSum('punch_count', 'Marcas')}
                ${this._thSum('device_name', 'Dispositivo')}
                <th></th>
              </tr>
            </thead>
            <tbody id="att-sum-tbody"></tbody>
          </table>
        </div>
        <div class="text-muted text-sm" style="margin-top:8px;padding:0 4px">
          * Tiempo bruto = primera a última marcación. Para horas con descuentos usa <strong>Planillas</strong>.
        </div>
      </div>

      <div id="att-empty" class="empty-state hidden">
        <i class="ri-time-line"></i>
        <h3>Sin registros</h3>
        <p>No se encontraron registros con los filtros actuales.</p>
      </div>

      <div id="att-page-bot" class="pagination" style="margin-top:12px;justify-content:center"></div>

      <div class="card" style="margin-top:20px;display:none" id="att-log-card">
        <div class="card-title mb-8">Progreso de sincronización</div>
        <div class="log-box" id="att-log"></div>
      </div>
    </div>`;
  },

  _thRec(key, label) {
    const active = this._sortKey === key;
    return `<th class="th-sort${active ? ' '+this._sortDir : ''}" onclick="AttendanceView._sortRec('${key}')">${label}<span class="sort-arrow"></span></th>`;
  },
  _thSum(key, label) {
    const active = this._sumSortKey === key;
    return `<th class="th-sort${active ? ' '+this._sumSortDir : ''}" onclick="AttendanceView._sortSum('${key}')">${label}<span class="sort-arrow"></span></th>`;
  },

  async init() {
    [this._employees, this._devices] = await Promise.all([
      window.api.getEmployees(),
      window.api.getDevices(),
    ]);
    const empSel = document.getElementById('att-emp');
    if (empSel) {
      this._employees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = `${e.zk_id}|${e.device_id}`;
        opt.textContent = e.effective_name || e.name;
        if (opt.value === this._filters.employeeId) opt.selected = true;
        empSel.appendChild(opt);
      });
    }
    const devSel = document.getElementById('att-dev');
    if (devSel) {
      this._devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        if (d.id === this._filters.deviceId) opt.selected = true;
        devSel.appendChild(opt);
      });
    }
    if (!this._filters.dateFrom) this._filters.dateFrom = App.monthStart();
    if (!this._filters.dateTo)   this._filters.dateTo   = App.today();
    await this._applyFilters();
  },

  _setFilter(key, val) { this._filters[key] = val; },

  _setMode(mode) {
    this._viewMode = mode;
    this._page = 1;
    document.getElementById('mode-records')?.classList.toggle('active', mode === 'records');
    document.getElementById('mode-summary')?.classList.toggle('active', mode === 'summary');
    this._renderView();
  },

  _setPageSize(n) { this._pageSize = n; this._page = 1; this._renderView(); },

  _sortRec(key) {
    this._sortDir = (this._sortKey === key && this._sortDir === 'asc') ? 'desc' : 'asc';
    this._sortKey = key;
    this._page = 1;
    this._renderTable();
  },

  _sortSum(key) {
    this._sumSortDir = (this._sumSortKey === key && this._sumSortDir === 'asc') ? 'desc' : 'asc';
    this._sumSortKey = key;
    this._page = 1;
    this._renderSummary();
  },

  async _applyFilters() {
    this._page = 1;
    document.getElementById('att-progress')?.classList.remove('hidden');
    try {
      this._records = await window.api.getAttendance({
        dateFrom:   this._filters.dateFrom,
        dateTo:     this._filters.dateTo,
        employeeId: this._filters.employeeId,
        deviceId:   this._filters.deviceId,
        search:     this._filters.search,
        limit:      5000,
      });
      this._summary = this._computeDailySummary();
    } catch {}
    document.getElementById('att-progress')?.classList.add('hidden');
    this._renderView();
  },

  _resetFilters() {
    this._filters = { dateFrom: App.monthStart(), dateTo: App.today(), employeeId: '', deviceId: '', punchType: '', search: '' };
    ['att-from','att-to','att-emp','att-dev','att-ptype','att-search'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.value = [this._filters.dateFrom, this._filters.dateTo, '', '', '', ''][i];
    });
    this._applyFilters();
  },

  _quick(range) {
    const map = { today:[App.today(),App.today()], week:[App.weekStart(),App.today()], month:[App.monthStart(),App.today()], prev:[App.prevMonthStart(),App.prevMonthEnd()] };
    const [from, to] = map[range];
    this._filters.dateFrom = from; this._filters.dateTo = to;
    document.getElementById('att-from').value = from;
    document.getElementById('att-to').value   = to;
    this._applyFilters();
  },

  _filterByEmployee(id) {
    this._filters.employeeId = id;
    this._filters.dateFrom = App.monthStart();
    this._filters.dateTo   = App.today();
    this.init();
  },

  _computeDailySummary() {
    const byKey = {};
    for (const r of this._records) {
      const day = r.timestamp_local.split(' ')[0];
      const k   = `${r.zk_user_id}|${r.device_id}|${day}`;
      if (!byKey[k]) byKey[k] = {
        employee_name: r.employee_name || `ID ${r.zk_user_id}`,
        zk_user_id:   r.zk_user_id,
        device_name:  r.device_name || '—',
        date:         day,
        punches:      [],
      };
      byKey[k].punches.push(r.timestamp_local);
    }

    return Object.values(byKey).map(item => {
      item.punches.sort();
      const n = item.punches.length;
      const p_entry     = item.punches[0] || null;
      const p_lunch_out = n >= 3 ? item.punches[1] : null;
      const p_lunch_in  = n >= 4 ? item.punches[2] : null;
      const p_exit      = n >= 4 ? item.punches[3] : (n === 2 ? item.punches[1] : null);

      const ci = p_entry;
      const co = n > 1 ? item.punches[n - 1] : null;
      let hrs  = null;
      if (co) hrs = Math.max(0, (new Date(co.replace(' ','T')) - new Date(ci.replace(' ','T'))) / 3600000);

      return {
        employee_name: item.employee_name,
        zk_user_id:   item.zk_user_id,
        device_name:  item.device_name,
        date:         item.date,
        check_in:     ci,
        check_out:    co,
        p_entry, p_lunch_out, p_lunch_in, p_exit,
        punch_count:  n,
        hours_raw:    hrs,
      };
    }).sort((a, b) => b.date.localeCompare(a.date) || a.employee_name.localeCompare(b.employee_name));
  },

  _renderView() {
    const recView = document.getElementById('att-records-view');
    const sumView = document.getElementById('att-summary-view');
    if (this._viewMode === 'summary') {
      if (recView) recView.style.display = 'none';
      if (sumView) sumView.style.display = '';
      this._renderSummary();
    } else {
      if (sumView) sumView.style.display = 'none';
      if (recView) recView.style.display = '';
      this._renderTable();
    }
  },

  _getFilteredRecords() {
    let list = this._records;
    if (this._filters.punchType !== '') {
      const pt = parseInt(this._filters.punchType);
      list = list.filter(r => r.punch_type === pt);
    }
    if (this._sortKey) list = App.sortData(list, this._sortKey, this._sortDir);
    return list;
  },

  _getFilteredSummary() {
    let list = this._summary;
    if (this._sumSortKey) list = App.sortData(list, this._sumSortKey, this._sumSortDir);
    return list;
  },

  _renderTable() {
    const tbody = document.getElementById('att-tbody');
    const empty = document.getElementById('att-empty');
    const count = document.getElementById('att-count');
    if (!tbody) return;

    const all   = this._getFilteredRecords();
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / this._pageSize));
    const start = (this._page - 1) * this._pageSize;
    const page  = all.slice(start, start + this._pageSize);

    count.textContent = `${total.toLocaleString()} marcaciones`;

    if (total === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); this._renderPagination(0,0); return; }
    empty.classList.add('hidden');

    tbody.innerHTML = page.map(r => `
      <tr>
        <td><strong>${r.employee_name || `ID ${r.zk_user_id}`}</strong></td>
        <td><span class="badge badge-gray">${r.zk_user_id}</span></td>
        <td>${App.fmtDate(r.timestamp_local)}</td>
        <td><strong>${App.fmtTime(r.timestamp_local)}</strong></td>
        <td>${App.punchBadge(r.punch_type)}</td>
        <td><span class="text-sm text-muted">${r.device_name || '—'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Editar marcación" onclick="AttendanceView._editRecord(${r.id})">
            <i class="ri-edit-line"></i>
          </button>
          <button class="btn btn-ghost btn-sm" title="Eliminar" style="color:var(--error)" onclick="AttendanceView._deleteRecord(${r.id})">
            <i class="ri-delete-bin-line"></i>
          </button>
        </td>
      </tr>`).join('');

    this._renderPagination(pages, this._page);
  },

  _renderSummary() {
    const tbody = document.getElementById('att-sum-tbody');
    const empty = document.getElementById('att-empty');
    const count = document.getElementById('att-count');
    if (!tbody) return;

    const all   = this._getFilteredSummary();
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / this._pageSize));
    const start = (this._page - 1) * this._pageSize;
    const page  = all.slice(start, start + this._pageSize);

    count.textContent = `${total.toLocaleString()} jornadas (${this._records.length.toLocaleString()} marcaciones)`;

    if (total === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); this._renderPagination(0,0); return; }
    empty.classList.add('hidden');

    const tp = t => t ? `<strong>${App.fmtTime(t)}</strong>` : '<span class="text-muted">—</span>';

    tbody.innerHTML = page.map(r => {
      const hrsStr = r.hours_raw != null ? this._fmtSpan(r.hours_raw) : '—';
      let status;
      if (r.punch_count === 1)      status = '<span class="badge badge-orange">Sin salida</span>';
      else if (r.punch_count === 3) status = '<span class="badge badge-orange">Incompleto</span>';
      else if (r.punch_count === 0) status = '<span class="badge badge-red">Sin marcas</span>';
      else                          status = `<span class="badge badge-green">${r.punch_count} marcas</span>`;

      const incomplete = (r.punch_count % 2 !== 0);
      const rowStyle = incomplete ? 'style="background:rgba(251,191,36,.06)"' : '';

      return `
        <tr ${rowStyle}>
          <td><strong>${r.employee_name}</strong></td>
          <td>${r.date}</td>
          <td style="color:var(--primary)">${tp(r.p_entry)}</td>
          <td style="color:var(--text2)">${tp(r.p_lunch_out)}</td>
          <td style="color:var(--text2)">${tp(r.p_lunch_in)}</td>
          <td style="color:var(--success)">${tp(r.p_exit)}</td>
          <td class="num-cell">
            ${r.hours_raw != null
              ? `<div style="display:flex;align-items:center;gap:6px">
                   <div style="flex:1;min-width:40px;background:var(--border);height:4px">
                     <div style="width:${Math.min(100,(r.hours_raw/10)*100).toFixed(0)}%;background:var(--primary);height:100%"></div>
                   </div><span>${hrsStr}</span></div>`
              : '—'}
          </td>
          <td class="num-cell">${status}</td>
          <td><span class="text-sm text-muted">${r.device_name}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="AttendanceView._showPunches('${r.zk_user_id}','${r.date}')">
              Ver marcas
            </button>
          </td>
        </tr>`;
    }).join('');

    this._renderPagination(pages, this._page);
  },

  _fmtSpan(h) {
    const hrs  = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${hrs}h ${String(mins).padStart(2,'0')}min`;
  },

  // ── Edit single attendance record ──────────────────────────────────────────
  _editRecord(id) {
    const rec = this._records.find(r => r.id === id);
    if (!rec) return;

    const dt    = rec.timestamp_local; // "YYYY-MM-DD HH:MM:SS"
    const date  = dt.split(' ')[0];
    const time  = (dt.split(' ')[1] || '00:00:00').substring(0,5);
    const empName = rec.employee_name || `ID ${rec.zk_user_id}`;

    const punchOpts = [
      [0,'Entrada'], [1,'Salida'], [2,'Sal. Descanso'], [3,'Ret. Descanso'], [4,'Extra Entrada'], [5,'Extra Salida'],
    ].map(([v,l]) => `<option value="${v}" ${rec.punch_type===v?'selected':''}>${l}</option>`).join('');

    App.showModal(`Editar marcación — ${empName}`, `
      <div class="form-hint" style="margin-bottom:12px">ID Biómetro: ${rec.zk_user_id} · Dispositivo: ${rec.device_name || '—'}</div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input class="form-control" id="att-edit-date" type="date" value="${date}">
        </div>
        <div class="form-group">
          <label class="form-label">Hora</label>
          <input class="form-control" id="att-edit-time" type="time" value="${time}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de marcación</label>
        <select class="form-control" id="att-edit-type">${punchOpts}</select>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="AttendanceView._saveRecord(${id})">
        <i class="ri-save-line"></i> Guardar
      </button>
    `);
  },

  async _saveRecord(id) {
    const date      = document.getElementById('att-edit-date')?.value;
    const time      = document.getElementById('att-edit-time')?.value;
    const punchType = parseInt(document.getElementById('att-edit-type')?.value) || 0;
    if (!date || !time) { App.toast('Completa fecha y hora', 'warning'); return; }

    const timestamp_local = `${date} ${time}:00`;
    try {
      await window.api.updateAttendance(id, { timestamp_local, punch_type: punchType });
      App.closeModal();
      App.toast('Marcación actualizada', 'success');
      await this._applyFilters();
    } catch(err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },

  // ── Delete single attendance record ────────────────────────────────────────
  async _deleteRecord(id) {
    const rec = this._records.find(r => r.id === id);
    if (!rec) return;
    const empName = rec.employee_name || `ID ${rec.zk_user_id}`;
    const time    = App.fmtTime(rec.timestamp_local);
    const date    = App.fmtDate(rec.timestamp_local);

    if (!confirm(`¿Eliminar la marcación de ${empName} del ${date} a las ${time}?`)) return;
    try {
      await window.api.deleteAttendance([id]);
      App.toast('Marcación eliminada', 'success');
      await this._applyFilters();
    } catch(err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },

  // ── Punch detail modal (from summary view) ─────────────────────────────────
  _showPunches(userId, date) {
    const dayRecords = this._records
      .filter(r => r.zk_user_id === userId && r.timestamp_local.startsWith(date))
      .sort((a, b) => a.timestamp_local < b.timestamp_local ? -1 : 1);

    const empName = dayRecords[0]?.employee_name || `ID ${userId}`;
    const labels = ['1ª Entrada','1ª Salida','Sal. Almuerzo','Ret. Almuerzo','2ª Entrada','2ª Salida'];

    const rows = dayRecords.map((r, i) => `
      <tr>
        <td><span class="badge badge-gray">#${i+1}</span></td>
        <td><strong>${App.fmtTime(r.timestamp_local)}</strong></td>
        <td>${App.punchBadge(r.punch_type)}</td>
        <td><span class="text-sm text-muted">${labels[i] || ''}</span></td>
        <td><span class="text-sm text-muted">${r.device_name || '—'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" title="Editar" onclick="App.closeModal();AttendanceView._editRecord(${r.id})">
            <i class="ri-edit-line"></i>
          </button>
          <button class="btn btn-ghost btn-sm" title="Eliminar" style="color:var(--error)" onclick="AttendanceView._deletePunchFromModal(${r.id},'${userId}','${date}')">
            <i class="ri-delete-bin-line"></i>
          </button>
        </td>
      </tr>`).join('');

    App.showModal(`Marcaciones — ${empName} — ${date}`, `
      <div class="table-wrap" style="max-height:320px;overflow-y:auto">
        <table>
          <thead><tr><th>#</th><th>Hora</th><th>Tipo</th><th>Posición</th><th>Dispositivo</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Sin marcaciones</td></tr>'}</tbody>
        </table>
      </div>
    `);
  },

  async _deletePunchFromModal(id, userId, date) {
    const rec = this._records.find(r => r.id === id);
    if (!rec) return;
    if (!confirm(`¿Eliminar esta marcación (${App.fmtTime(rec.timestamp_local)})?`)) return;
    try {
      await window.api.deleteAttendance([id]);
      App.toast('Marcación eliminada', 'success');
      await this._applyFilters();
      // Reopen the punch modal if there are still records for that day
      const remaining = this._records.filter(r => r.zk_user_id === userId && r.timestamp_local.startsWith(date));
      if (remaining.length > 0) {
        this._showPunches(userId, date);
      }
    } catch(err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },

  _renderPagination(pages, current) {
    const html = this._buildPager(pages, current);
    ['att-page-top','att-page-bot'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
  },

  _buildPager(pages, current) {
    if (pages <= 1) return '';
    let html = '';
    const add = (p, label, active) =>
      `<button class="page-btn ${active?'active':''}" onclick="AttendanceView._goPage(${p})">${label}</button>`;
    html += add(current-1,'‹',false);
    if (pages <= 7) {
      for (let p = 1; p <= pages; p++) html += add(p,p,p===current);
    } else {
      html += add(1,1,current===1);
      if (current > 3) html += '<span class="page-btn" style="cursor:default">…</span>';
      for (let p = Math.max(2,current-1); p <= Math.min(pages-1,current+1); p++) html += add(p,p,p===current);
      if (current < pages-2) html += '<span class="page-btn" style="cursor:default">…</span>';
      html += add(pages,pages,current===pages);
    }
    html += add(current+1,'›',false);
    return html;
  },

  _goPage(p) {
    const data  = this._viewMode === 'summary' ? this._getFilteredSummary() : this._getFilteredRecords();
    const pages = Math.ceil(data.length / this._pageSize);
    if (p < 1 || p > pages) return;
    this._page = p;
    this._renderView();
    document.getElementById('view-container').scrollTop = 0;
  },

  async _syncNow() {
    const logCard = document.getElementById('att-log-card');
    const logBox  = document.getElementById('att-log');
    if (logCard) { logCard.style.display = 'block'; logBox.innerHTML = ''; }
    const btn = document.getElementById('btn-sync-att');
    btn.disabled = true;
    App.setSyncStatus('syncing', 'Sincronizando...');

    const unsub = window.api.onSyncLog(log => {
      const line = document.createElement('div');
      line.className = `log-line log-${log.level}`;
      line.textContent = `[${new Date().toLocaleTimeString()}] ${log.msg}`;
      logBox.appendChild(line);
      logBox.scrollTop = logBox.scrollHeight;
    });

    try {
      const result = await window.api.downloadAttendance({
        dateFrom: this._filters.dateFrom || App.monthStart(),
        dateTo:   this._filters.dateTo   || App.today(),
      });
      App.setSyncStatus('ok', `${result.totalNew} nuevos`);
      App.toast(`${result.totalNew} nuevos registros descargados`, 'success');
      await this._applyFilters();
    } catch(err) {
      App.setSyncStatus('error', 'Error');
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      if (unsub) unsub();
    }
  },

  async _exportExcel() {
    const dateFrom = document.getElementById('att-from')?.value || this._filters.dateFrom;
    const dateTo   = document.getElementById('att-to')?.value   || this._filters.dateTo;
    const data     = this._viewMode === 'summary' ? this._getFilteredSummary() : this._getFilteredRecords();
    if (!data.length) { App.toast('Sin datos para exportar', 'warning'); return; }
    this._showColumnSelector(this._viewMode, dateFrom, dateTo);
  },

  _showColumnSelector(mode, dateFrom, dateTo) {
    const summaryColumns = [
      { key: 'employee',    label: 'Empleado',       checked: true },
      { key: 'date',        label: 'Fecha',           checked: true },
      { key: 'p_entry',     label: 'Entrada',         checked: true },
      { key: 'p_lunch_out', label: 'Sal. Almuerzo',   checked: true },
      { key: 'p_lunch_in',  label: 'Ret. Almuerzo',   checked: true },
      { key: 'p_exit',      label: 'Salida',           checked: true },
      { key: 'hours',       label: 'Tiempo Bruto',     checked: true },
      { key: 'punches',     label: 'Nº Marcas',        checked: true },
      { key: 'device',      label: 'Dispositivo',      checked: false },
    ];
    const recordColumns = [
      { key: 'employee',   label: 'Empleado',       checked: true },
      { key: 'zk_id',      label: 'ID Biómetro',    checked: true },
      { key: 'date',        label: 'Fecha',          checked: true },
      { key: 'time',        label: 'Hora',           checked: true },
      { key: 'punch_type',  label: 'Tipo marcación', checked: true },
      { key: 'device',      label: 'Dispositivo',    checked: false },
    ];
    const cols = mode === 'summary' ? summaryColumns : recordColumns;
    const checks = cols.map(c =>
      `<label><input type="checkbox" name="col" value="${c.key}" ${c.checked?'checked':''}> ${c.label}</label>`
    ).join('');
    App.showModal('Seleccionar columnas para exportar', `
      <p class="text-muted text-sm" style="margin-bottom:12px">Elige las columnas a incluir en el Excel.</p>
      <div class="col-check-grid">${checks}</div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="AttendanceView._doExport('${mode}','${dateFrom}','${dateTo}')">
        <i class="ri-file-excel-2-line"></i> Exportar
      </button>
    `);
  },

  async _doExport(mode, dateFrom, dateTo) {
    const selected = Array.from(document.querySelectorAll('input[name=col]:checked')).map(el => el.value);
    if (!selected.length) { App.toast('Selecciona al menos una columna', 'warning'); return; }
    App.closeModal();
    try {
      const data = mode === 'summary' ? this._getFilteredSummary() : this._getFilteredRecords();
      const r = await window.api.exportAttendanceExcel({
        mode, summary: data, records: data, dateFrom, dateTo, columns: selected,
      });
      if (r?.saved) App.toast(`Guardado: ${r.path}`, 'success');
    } catch(err) { App.toast(err.message, 'error'); }
  },

  async _importExcel() {
    if (!this._devices.length) { this._devices = await window.api.getDevices(); }
    if (!this._devices.length) { App.toast('Configura al menos un dispositivo primero', 'warning'); return; }

    const devOpts = this._devices.map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`).join('');
    App.showModal('Importar marcaciones desde Excel', `
      <div class="form-group">
        <label class="form-label">Modo de importación</label>
        <select class="form-control" id="imp-att-mode">
          <option value="new">Solo agregar nuevos (sin modificar existentes)</option>
          <option value="update">Reemplazar registros duplicados</option>
        </select>
        <div class="form-hint">Los duplicados se detectan por: ID empleado + dispositivo + fecha/hora exacta.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Dispositivo destino</label>
        <select class="form-control" id="imp-att-dev">${devOpts}</select>
        <div class="form-hint">Todos los registros importados se asociarán a este dispositivo.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Archivo Excel</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="AttendanceView._pickFile('imp-att-path')">
            <i class="ri-folder-open-line"></i> Seleccionar
          </button>
          <span id="imp-att-path-label" class="text-sm text-muted">Ningún archivo seleccionado</span>
          <input type="hidden" id="imp-att-path">
        </div>
        <div class="form-hint">Columnas requeridas: ID Biómetro, Fecha (YYYY-MM-DD), Hora (HH:MM). Opcional: Tipo (0=Entrada, 1=Salida).</div>
      </div>
      <div id="imp-att-result"></div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="btn-do-imp-att" onclick="AttendanceView._doImportExcel()">
        <i class="ri-upload-2-line"></i> Importar
      </button>
    `);
  },

  async _pickFile(inputId) {
    const filePath = await window.api.openFileDialog({
      title: 'Seleccionar archivo Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx','xls'] }],
      properties: ['openFile'],
    });
    if (!filePath) return;
    const input = document.getElementById(inputId);
    const label = document.getElementById(`${inputId}-label`);
    if (input) input.value = filePath;
    if (label) label.textContent = filePath.split(/[\\/]/).pop();
  },

  async _doImportExcel() {
    const filePath = document.getElementById('imp-att-path')?.value;
    if (!filePath) { App.toast('Selecciona un archivo Excel', 'warning'); return; }
    const mode     = document.getElementById('imp-att-mode')?.value;
    const deviceId = document.getElementById('imp-att-dev')?.value;
    const btn = document.getElementById('btn-do-imp-att');
    const res = document.getElementById('imp-att-result');
    btn.disabled = true;
    try {
      const r = await window.api.importAttendanceExcel({ filePath, mode, deviceId });
      res.innerHTML = `<div class="import-result">
        ✅ <strong>${r.inserted}</strong> registros importados de ${r.total} filas
        ${r.skipped ? ` · ${r.skipped} omitidos` : ''}
      </div>`;
      App.toast(`${r.inserted} marcaciones importadas`, 'success');
      await this._applyFilters();
    } catch(err) {
      res.innerHTML = `<div class="import-result" style="border-color:var(--error)">❌ ${err.message}</div>`;
      btn.disabled = false;
    }
  },
};
