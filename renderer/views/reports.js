window.ReportsView = {
  _result:       [],
  _employees:    [],
  _busy:         false,
  _selectedEmps: [],   // [{id, label}]
  _empQuery:     '',
  _dropOpen:     false,

  render() {
    return `
    <div>
      <div class="section-header mb-16">
        <div>
          <div class="section-title">Planillas y Reportes</div>
          <div class="section-sub">Cálculo de horas trabajadas, extra y tardanzas por período</div>
        </div>
        <div class="section-actions" id="report-actions" style="display:none">
          <button class="btn btn-primary btn-sm" onclick="ReportsView._exportExcel()">
            <i class="ri-file-excel-2-line"></i> Exportar Excel
          </button>
        </div>
      </div>

      <!-- Parameters card -->
      <div class="card mb-16">
        <div class="card-title mb-12">Parámetros de cálculo</div>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:16px;align-items:flex-end">

          <!-- Period -->
          <div class="form-group" style="margin:0">
            <label class="form-label">Período</label>
            <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" onclick="ReportsView._quickPeriod('month')">Este mes</button>
              <button class="btn btn-ghost btn-sm" onclick="ReportsView._quickPeriod('prev')">Mes anterior</button>
              <button class="btn btn-ghost btn-sm" onclick="ReportsView._quickPeriod('week')">Esta semana</button>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <input class="form-control" id="rep-from" type="date" value="${App.monthStart()}">
              <span class="text-muted">—</span>
              <input class="form-control" id="rep-to" type="date" value="${App.today()}">
            </div>
          </div>

          <!-- Employee tag selector -->
          <div class="form-group tag-group" style="margin:0">
            <label class="form-label">Empleados</label>
            <div class="tag-input-wrap" id="rep-emp-wrap" onclick="ReportsView._focusInput()">
              <div id="rep-emp-tags" style="display:contents"></div>
              <input class="tag-input" id="rep-emp-input"
                placeholder="Escribe para filtrar y seleccionar..."
                oninput="ReportsView._onInput(this.value)"
                onfocus="ReportsView._onFocus()"
                onblur="ReportsView._onBlur()"
                onkeydown="ReportsView._onKeydown(event)"
                autocomplete="off">
            </div>
            <div class="tag-dropdown hidden" id="rep-emp-drop"></div>
            <div class="form-hint">Sin selección = todos los empleados</div>
          </div>

          <!-- Calculate button -->
          <div style="align-self:flex-end">
            <button class="btn btn-primary" id="btn-calc" onclick="ReportsView._calculate()" style="height:36px;width:100%">
              <i class="ri-calculator-line"></i> Calcular Planilla
            </button>
          </div>
        </div>
      </div>

      <div id="rep-progress" class="progress mb-12 hidden"><div class="progress-bar indeterminate"></div></div>

      <!-- Summary KPIs -->
      <div id="rep-summary" class="hidden mb-16">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--border);border:1px solid var(--border)">
          <div style="background:var(--surface);padding:14px 16px;text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;font-weight:700">Empleados</div>
            <div style="font-size:24px;font-weight:700;color:var(--text);margin-top:4px" id="sum-emp">0</div>
          </div>
          <div style="background:var(--surface);padding:14px 16px;text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;font-weight:700">Días período</div>
            <div style="font-size:24px;font-weight:700;color:var(--text);margin-top:4px" id="sum-days">0</div>
          </div>
          <div style="background:var(--surface);padding:14px 16px;text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;font-weight:700">Hrs normales</div>
            <div style="font-size:24px;font-weight:700;color:var(--primary);margin-top:4px" id="sum-normal">0</div>
          </div>
          <div style="background:var(--surface);padding:14px 16px;text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;font-weight:700">Hrs extra</div>
            <div style="font-size:24px;font-weight:700;color:var(--success);margin-top:4px" id="sum-ot">0</div>
          </div>
          <div style="background:var(--surface);padding:14px 16px;text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;font-weight:700">Ausencias</div>
            <div style="font-size:24px;font-weight:700;color:var(--error);margin-top:4px" id="sum-abs">0</div>
          </div>
          <div style="background:var(--surface);padding:14px 16px;text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;font-weight:700">Tardanzas</div>
            <div style="font-size:24px;font-weight:700;color:var(--warning);margin-top:4px" id="sum-late">0</div>
          </div>
        </div>
      </div>

      <!-- Results table -->
      <div id="rep-results" class="hidden">
        <div class="table-wrap" id="rep-table-wrap"></div>
      </div>

      <div id="rep-empty" class="empty-state hidden">
        <i class="ri-file-chart-line"></i>
        <h3>Sin datos en el período</h3>
        <p>No se encontraron registros para el período y empleados seleccionados. Sincroniza primero el dispositivo.</p>
      </div>
    </div>`;
  },

  async init() {
    this._employees = await window.api.getEmployees();
    this._renderTags();
    this._renderDropdown('');
  },

  // ── Tag selector ──────────────────────────────────────────────────────────────
  _focusInput() { document.getElementById('rep-emp-input')?.focus(); },

  _onFocus() {
    this._dropOpen = true;
    this._renderDropdown(this._empQuery);
    document.getElementById('rep-emp-drop')?.classList.remove('hidden');
  },

  _onBlur() {
    setTimeout(() => {
      this._dropOpen = false;
      document.getElementById('rep-emp-drop')?.classList.add('hidden');
    }, 180);
  },

  _onInput(val) {
    this._empQuery = val;
    this._renderDropdown(val);
  },

  _onKeydown(e) {
    if (e.key === 'Escape') { document.getElementById('rep-emp-input').blur(); return; }
    if (e.key === 'Backspace' && !this._empQuery && this._selectedEmps.length) {
      this._selectedEmps.pop();
      this._renderTags();
      return;
    }
    if (e.key === 'Enter') {
      const first = document.querySelector('.tag-dropdown-item');
      if (first) first.click();
    }
  },

  _renderTags() {
    const wrap = document.getElementById('rep-emp-tags');
    if (!wrap) return;
    wrap.innerHTML = this._selectedEmps.map(e => `
      <span class="emp-tag">
        ${e.label}
        <button onmousedown="event.preventDefault()" onclick="ReportsView._removeEmp('${e.id}')">✕</button>
      </span>`).join('');
  },

  _renderDropdown(query) {
    const drop = document.getElementById('rep-emp-drop');
    if (!drop) return;
    const q = query.toLowerCase().trim();
    const already = new Set(this._selectedEmps.map(e => e.id));
    const matches = this._employees.filter(e => {
      if (already.has(`${e.zk_id}|${e.device_id}`)) return false;
      return !q ||
        (e.effective_name||'').toLowerCase().includes(q) ||
        (e.display_name||'').toLowerCase().includes(q) ||
        (e.name||'').toLowerCase().includes(q) ||
        String(e.zk_id).includes(q) ||
        (e.department||'').toLowerCase().includes(q);
    }).slice(0, 20);

    if (!matches.length) {
      drop.innerHTML = `<div class="tag-dropdown-item" style="color:var(--text3);cursor:default">Sin resultados</div>`;
    } else {
      drop.innerHTML = matches.map(e => {
        const label = e.effective_name || e.name;
        const sub   = e.department ? ` · ${e.department}` : '';
        return `<div class="tag-dropdown-item" onmousedown="event.preventDefault()"
          onclick="ReportsView._addEmp('${e.zk_id}|${e.device_id}','${label.replace(/'/g,"\\'")}')">
          ${label}<small>${sub}</small>
        </div>`;
      }).join('');
    }
    drop.classList.toggle('hidden', !this._dropOpen);
  },

  _addEmp(id, label) {
    if (!this._selectedEmps.find(e => e.id === id)) {
      this._selectedEmps.push({ id, label });
      this._renderTags();
    }
    const input = document.getElementById('rep-emp-input');
    if (input) { input.value = ''; this._empQuery = ''; }
    this._renderDropdown('');
  },

  _removeEmp(id) {
    this._selectedEmps = this._selectedEmps.filter(e => e.id !== id);
    this._renderTags();
  },

  // ── Calculation ───────────────────────────────────────────────────────────────
  _quickPeriod(range) {
    const map = { month:[App.monthStart(),App.today()], prev:[App.prevMonthStart(),App.prevMonthEnd()], week:[App.weekStart(),App.today()] };
    const [from, to] = map[range];
    document.getElementById('rep-from').value = from;
    document.getElementById('rep-to').value   = to;
  },

  async _calculate() {
    if (this._busy) return;
    this._busy = true;
    const btn = document.getElementById('btn-calc');
    btn.disabled = true;

    const dateFrom    = document.getElementById('rep-from').value;
    const dateTo      = document.getElementById('rep-to').value;
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      App.toast('Período inválido', 'error');
      btn.disabled = false; this._busy = false; return;
    }

    const employeeIds = this._selectedEmps.length ? this._selectedEmps.map(e => e.id) : null;

    document.getElementById('rep-progress').classList.remove('hidden');
    document.getElementById('rep-summary').classList.add('hidden');
    document.getElementById('rep-results').classList.add('hidden');
    document.getElementById('rep-empty').classList.add('hidden');

    try {
      this._result = await window.api.calculatePayroll({ dateFrom, dateTo, employeeIds });
      if (!this._result || this._result.length === 0) {
        document.getElementById('rep-empty').classList.remove('hidden');
      } else {
        this._renderResults(dateFrom, dateTo);
      }
    } catch(err) {
      App.toast(`Error al calcular: ${err.message}`, 'error');
    } finally {
      document.getElementById('rep-progress').classList.add('hidden');
      btn.disabled = false; this._busy = false;
    }
  },

  _renderResults(dateFrom, dateTo) {
    const data = this._result;

    const totNormal = data.reduce((s,e) => s + e.total_normal_hours, 0);
    const totOT     = data.reduce((s,e) => s + e.total_overtime_hours, 0);
    const totAbs    = data.reduce((s,e) => s + e.days_absent, 0);
    const totLate   = data.reduce((s,e) => s + e.days_late, 0);
    document.getElementById('sum-emp').textContent    = data.length;
    document.getElementById('sum-days').textContent   = data[0]?.period_days || 0;
    document.getElementById('sum-normal').textContent = App.fmtHours(totNormal);
    document.getElementById('sum-ot').textContent     = App.fmtHours(totOT);
    document.getElementById('sum-abs').textContent    = totAbs;
    document.getElementById('sum-late').textContent   = totLate;
    document.getElementById('rep-summary').classList.remove('hidden');

    const maxHours = Math.max(...data.map(e => e.total_hours), 1);
    const wrap = document.getElementById('rep-table-wrap');
    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Empleado</th>
            <th class="num-cell">Días Trab.</th>
            <th class="num-cell">Ausencias</th>
            <th class="num-cell">Tardanzas</th>
            <th>Horas trabajadas</th>
            <th class="num-cell">Extra</th>
            <th class="num-cell">Min Tard.</th>
            <th class="num-cell">% Asist.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${data.map((e, i) => {
            const pct  = Math.round((e.total_hours / maxHours) * 100);
            const pctN = Math.round((e.total_normal_hours / Math.max(e.total_hours, 0.01)) * 100);
            return `
          <tr class="${e.days_absent > 0 ? 'row-absent' : ''}">
            <td>
              <strong>${e.employee_name}</strong>
              ${e.days_incomplete > 0 ? `<span class="badge badge-gray" style="margin-left:4px;font-size:10px">${e.days_incomplete} sin salida</span>` : ''}
            </td>
            <td class="num-cell">${e.days_worked} / ${e.period_days}</td>
            <td class="num-cell">${e.days_absent > 0
              ? `<span class="badge badge-red">${e.days_absent}</span>`
              : '<span style="color:var(--text3)">0</span>'}</td>
            <td class="num-cell">${e.days_late > 0
              ? `<span class="badge badge-orange">${e.days_late}</span>`
              : '<span style="color:var(--text3)">0</span>'}</td>
            <td style="min-width:180px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;background:var(--border);height:6px;position:relative;overflow:hidden">
                  <div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;display:flex">
                    <div style="width:${pctN}%;background:var(--primary)"></div>
                    <div style="flex:1;background:var(--success)"></div>
                  </div>
                </div>
                <span style="white-space:nowrap;font-size:12px">
                  <strong>${App.fmtHours(e.total_normal_hours)}</strong>
                  ${e.total_overtime_hours > 0 ? `<span style="color:var(--success)"> +${App.fmtHours(e.total_overtime_hours)}</span>` : ''}
                </span>
              </div>
            </td>
            <td class="num-cell" style="color:var(--success)">${e.total_overtime_hours > 0 ? App.fmtHours(e.total_overtime_hours) : '—'}</td>
            <td class="num-cell">${e.total_delay_minutes > 0 ? `<span style="color:var(--warning)">${e.total_delay_minutes}</span>` : '0'}</td>
            <td class="num-cell">
              <span class="badge ${e.attendance_rate >= 90 ? 'badge-green' : e.attendance_rate >= 70 ? 'badge-orange' : 'badge-red'}">
                ${e.attendance_rate}%
              </span>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="ReportsView._showDetail(${i})">Detalle</button>
            </td>
          </tr>`;}).join('')}
        </tbody>
      </table>`;

    document.getElementById('rep-results').classList.remove('hidden');
    document.getElementById('report-actions').style.display = 'flex';
  },

  _showDetail(idx) {
    const emp  = this._result[idx];
    const rows = emp.details.map(d => {
      let statusBadge;
      switch(d.status) {
        case 'ok':         statusBadge = '<span class="badge badge-green">OK</span>'; break;
        case 'tardanza':   statusBadge = '<span class="badge badge-orange">Tardanza</span>'; break;
        case 'ausente':    statusBadge = '<span class="badge badge-red">Ausente</span>'; break;
        case 'incompleto': statusBadge = '<span class="badge badge-gray">Sin salida</span>'; break;
        default:           statusBadge = d.status;
      }
      return `<tr>
        <td>${d.date}</td>
        <td>${statusBadge}</td>
        <td>${d.check_in  ? App.fmtTime(d.check_in)  : '—'}</td>
        <td>${d.check_out ? App.fmtTime(d.check_out) : '—'}</td>
        <td class="num-cell">${d.hours_worked != null ? App.fmtHours(d.hours_worked) : '—'}</td>
        <td class="num-cell" style="color:var(--success)">${d.overtime ? App.fmtHours(d.overtime) : '—'}</td>
        <td class="num-cell" style="color:var(--warning)">${d.delay_minutes || 0} min</td>
        <td class="num-cell text-muted">${d.punch_count || '—'}</td>
      </tr>`;
    }).join('');

    App.showModal(`Detalle — ${emp.employee_name}`, `
      <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge badge-blue">Trabajados: ${emp.days_worked}d</span>
        <span class="badge badge-green">Hrs normales: ${App.fmtHours(emp.total_normal_hours)}</span>
        <span class="badge badge-green">Hrs extra: ${App.fmtHours(emp.total_overtime_hours)}</span>
        <span class="badge badge-red">Ausencias: ${emp.days_absent}d</span>
        <span class="badge badge-orange">Tardanzas: ${emp.days_late}d</span>
      </div>
      <div class="table-wrap" style="max-height:400px;overflow-y:auto">
        <table>
          <thead><tr>
            <th>Fecha</th><th>Estado</th><th>Entrada</th><th>Salida</th>
            <th class="num-cell">Horas</th><th class="num-cell">Extra</th>
            <th class="num-cell">Tardanza</th><th class="num-cell">Marcas</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  },

  // ── Export ────────────────────────────────────────────────────────────────────
  async _exportExcel() {
    if (!this._result.length) return;
    const dateFrom = document.getElementById('rep-from').value;
    const dateTo   = document.getElementById('rep-to').value;

    const cols = [
      { key: 'name', label: 'Empleado',         checked: true  },
      { key: 'pd',   label: 'Días período',      checked: true  },
      { key: 'dw',   label: 'Días trabajados',   checked: true  },
      { key: 'da',   label: 'Ausencias',         checked: true  },
      { key: 'di',   label: 'Incompletos',       checked: false },
      { key: 'dl',   label: 'Tardanzas',         checked: true  },
      { key: 'hn',   label: 'Hrs normales',      checked: true  },
      { key: 'he',   label: 'Hrs extra',         checked: true  },
      { key: 'th',   label: 'Total horas',       checked: true  },
      { key: 'mt',   label: 'Min tardanza',      checked: false },
      { key: 'att',  label: '% Asistencia',      checked: true  },
    ];

    const checks = cols.map(c =>
      `<label><input type="checkbox" name="rep-col" value="${c.key}" ${c.checked?'checked':''}> ${c.label}</label>`
    ).join('');

    App.showModal('Seleccionar columnas para exportar', `
      <p class="text-muted text-sm" style="margin-bottom:12px">Columnas del resumen. El detalle por empleado siempre se incluye como hojas separadas.</p>
      <div class="col-check-grid">${checks}</div>
    `, `
      <button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="ReportsView._doExport('${dateFrom}','${dateTo}')">
        <i class="ri-file-excel-2-line"></i> Exportar
      </button>
    `);
  },

  async _doExport(dateFrom, dateTo) {
    const selected = Array.from(document.querySelectorAll('input[name=rep-col]:checked')).map(el => el.value);
    if (!selected.length) { App.toast('Selecciona al menos una columna', 'warning'); return; }
    App.closeModal();
    try {
      const r = await window.api.exportPayrollExcel({ data: this._result, dateFrom, dateTo, columns: selected });
      if (r.saved) App.toast(`Guardado en: ${r.path}`, 'success');
    } catch(err) { App.toast(err.message, 'error'); }
  },
};
