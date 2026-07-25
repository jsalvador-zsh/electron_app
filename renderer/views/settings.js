window.SettingsView = {
  _settings: {},

  render() {
    return `
    <div>
      <div class="section-header mb-24">
        <div>
          <div class="section-title">Configuración</div>
          <div class="section-sub">Ajustes generales, empresa y horarios laborales</div>
        </div>
      </div>

      <!-- General -->
      <div class="card mb-16">
        <div class="card-title mb-16">Configuración general</div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Nombre de empresa</label>
            <input class="form-control" id="s-company" placeholder="Mi Empresa">
          </div>
          <div class="form-group">
            <label class="form-label">Zona horaria del dispositivo</label>
            <select class="form-control" id="s-tz">
              <option value="America/Lima">America/Lima (Perú)</option>
              <option value="America/Bogota">America/Bogota (Colombia)</option>
              <option value="America/Guayaquil">America/Guayaquil (Ecuador)</option>
              <option value="America/Santiago">America/Santiago (Chile)</option>
              <option value="America/Mexico_City">America/Mexico_City</option>
              <option value="America/Caracas">America/Caracas (Venezuela)</option>
              <option value="America/Buenos_Aires">America/Buenos_Aires</option>
              <option value="America/La_Paz">America/La_Paz (Bolivia)</option>
              <option value="America/Asuncion">America/Asuncion (Paraguay)</option>
              <option value="America/Montevideo">America/Montevideo (Uruguay)</option>
              <option value="America/Panama">America/Panama</option>
              <option value="America/New_York">America/New_York</option>
            </select>
            <div class="form-hint">Zona horaria configurada en el reloj biométrico</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="SettingsView._saveGeneral()">
          <i class="ri-save-line"></i> Guardar configuración
        </button>
      </div>

      <!-- Work schedule -->
      <div class="card mb-16">
        <div class="card-title mb-16">Horario laboral (para cálculo de planillas)</div>
        <div class="form-row cols-3">
          <div class="form-group">
            <label class="form-label">Horas laborales por día</label>
            <input class="form-control" id="s-hpd" type="number" step="0.5" min="1" max="24" placeholder="8">
            <div class="form-hint">Horas estándar sin contar extra</div>
          </div>
          <div class="form-group">
            <label class="form-label">Hora de ingreso</label>
            <input class="form-control" id="s-start" type="time" placeholder="08:00">
            <div class="form-hint">Hora de entrada esperada</div>
          </div>
          <div class="form-group">
            <label class="form-label">Tolerancia tardanza (min)</label>
            <input class="form-control" id="s-tol" type="number" min="0" max="60" placeholder="10">
            <div class="form-hint">Minutos de gracia antes de marcar tardanza</div>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Horas de descanso / almuerzo</label>
            <input class="form-control" id="s-break" type="number" step="0.5" min="0" max="4" placeholder="1">
            <div class="form-hint">Se descuentan del total (ej: 1 = 1 hora de almuerzo)</div>
          </div>
          <div class="form-group">
            <label class="form-label">Días laborables</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px" id="s-workdays">
              ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((d,i) =>
                `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border:1px solid var(--border);font-size:12px;font-weight:500">
                  <input type="checkbox" data-day="${i}" style="cursor:pointer"> ${d}
                </label>`).join('')}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="SettingsView._saveSchedule()">
          <i class="ri-save-line"></i> Guardar horario
        </button>
      </div>

      <!-- System info -->
      <div class="card">
        <div class="card-title mb-12">Información del sistema</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:13px">
          <div><span class="text-muted">Versión:</span> <strong>1.0.0</strong></div>
          <div>
            <span class="text-muted">Base de datos:</span>
            <button class="btn btn-ghost btn-sm" onclick="SettingsView._openDbFolder()" style="margin-left:4px">
              <i class="ri-folder-open-line"></i> Abrir carpeta
            </button>
          </div>
          <div><span class="text-muted">Ubicación:</span> <code style="font-size:11px">%APPDATA%/zkteco-desktop/</code></div>
        </div>
      </div>
    </div>`;
  },

  async init() {
    this._settings = await window.api.getSettings();
    this._populate();
  },

  _populate() {
    const s = this._settings;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('s-company', s.company_name);
    set('s-tz',      s.timezone);
    set('s-hpd',     s.hours_per_day);
    set('s-start',   s.start_time);
    set('s-tol',     s.tolerance_min);
    set('s-break',   s.break_hours);

    const workDays = (s.work_days || '1,2,3,4,5').split(',').map(Number);
    document.querySelectorAll('#s-workdays input[type=checkbox]').forEach(cb => {
      cb.checked = workDays.includes(parseInt(cb.dataset.day));
    });
  },

  async _saveGeneral() {
    await window.api.saveSettings({
      company_name: document.getElementById('s-company').value.trim(),
      timezone:     document.getElementById('s-tz').value,
    });
    App.toast('Configuración guardada', 'success');
  },

  async _saveSchedule() {
    const workDays = [];
    document.querySelectorAll('#s-workdays input[type=checkbox]:checked').forEach(cb => {
      workDays.push(cb.dataset.day);
    });
    await window.api.saveSettings({
      hours_per_day: document.getElementById('s-hpd').value   || '8',
      start_time:    document.getElementById('s-start').value || '08:00',
      tolerance_min: document.getElementById('s-tol').value   || '10',
      break_hours:   document.getElementById('s-break').value || '1',
      work_days:     workDays.join(',') || '1,2,3,4,5',
    });
    App.toast('Horario laboral guardado', 'success');
  },

  async _openDbFolder() {
    App.toast('Base de datos en %APPDATA%/zkteco-desktop/', 'info');
  },
};
