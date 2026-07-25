/**
 * SQLite database layer using sql.js (pure JavaScript/WASM — no C++ compiler needed).
 * DB file lives in: %APPDATA%/zkteco-desktop/zkteco.db
 */
const { app } = require('electron');
const path    = require('path');
const fs      = require('fs');

let db   = null;
let SQL  = null;
let _dbPath = null;

function getDbPath() {
  if (!_dbPath) {
    const dir = app.getPath('userData');
    _dbPath = path.join(dir, 'zkteco.db');
  }
  return _dbPath;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initDatabase() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });

  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    _migrate();
  } else {
    db = new SQL.Database();
    createTables();
    seedDefaultSettings();
    _save();
  }

  console.log('Database ready at:', dbPath);
}

function _migrate() {
  try { db.run("ALTER TABLE employees ADD COLUMN display_name TEXT DEFAULT ''"); _save(); } catch (_) {}
  try { db.run("ALTER TABLE employees ADD COLUMN end_time TEXT DEFAULT '17:00'"); _save(); } catch (_) {}
  try { db.run("ALTER TABLE employees ADD COLUMN archived INTEGER DEFAULT 0"); _save(); } catch (_) {}
  try { db.run("ALTER TABLE employees ADD COLUMN night_shift INTEGER DEFAULT 0"); _save(); } catch (_) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS employee_schedules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      zk_id        TEXT NOT NULL,
      device_id    TEXT NOT NULL,
      day_of_week  INTEGER NOT NULL,
      start_time   TEXT DEFAULT '08:00',
      end_time     TEXT DEFAULT '17:00',
      hours_per_day REAL DEFAULT 8.0,
      tolerance_min INTEGER DEFAULT 10,
      is_work_day  INTEGER DEFAULT 1,
      UNIQUE(zk_id, device_id, day_of_week)
    )`);
    _save();
  } catch (_) {}
}

function _save() {
  try {
    const data = db.export();
    fs.writeFileSync(getDbPath(), Buffer.from(data));
  } catch(e) { console.error('DB save error:', e); }
}

// ─── Query helpers ────────────────────────────────────────────────────────────
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  _save();
}

function exec(sql) {
  db.exec(sql);
  _save();
}

function runNoSave(sql, params = []) {
  db.run(sql, params);
}

// ─── Tables ───────────────────────────────────────────────────────────────────
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      ip       TEXT NOT NULL,
      port     INTEGER DEFAULT 4370,
      password INTEGER DEFAULT 0,
      timeout  INTEGER DEFAULT 60,
      enabled  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      zk_id         TEXT NOT NULL,
      device_id     TEXT NOT NULL,
      name          TEXT NOT NULL,
      display_name  TEXT DEFAULT '',
      department    TEXT DEFAULT '',
      position      TEXT DEFAULT '',
      schedule      TEXT DEFAULT 'regular',
      hours_per_day REAL DEFAULT 8.0,
      start_time    TEXT DEFAULT '08:00',
      end_time      TEXT DEFAULT '17:00',
      tolerance_min INTEGER DEFAULT 10,
      enabled       INTEGER DEFAULT 1,
      archived      INTEGER DEFAULT 0,
      night_shift   INTEGER DEFAULT 0,
      PRIMARY KEY (zk_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS employee_schedules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      zk_id         TEXT NOT NULL,
      device_id     TEXT NOT NULL,
      day_of_week   INTEGER NOT NULL,
      start_time    TEXT DEFAULT '08:00',
      end_time      TEXT DEFAULT '17:00',
      hours_per_day REAL DEFAULT 8.0,
      tolerance_min INTEGER DEFAULT 10,
      is_work_day   INTEGER DEFAULT 1,
      UNIQUE(zk_id, device_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id      TEXT NOT NULL,
      zk_user_id     TEXT NOT NULL,
      timestamp_local TEXT NOT NULL,
      timestamp_utc   TEXT NOT NULL,
      punch_type      INTEGER DEFAULT 0,
      verify_type     INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(device_id, zk_user_id, timestamp_local)
    );

    CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(zk_user_id, device_id);
    CREATE INDEX IF NOT EXISTS idx_att_ts   ON attendance(timestamp_local);

    CREATE TABLE IF NOT EXISTS sync_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id       TEXT,
      device_name     TEXT,
      date_from       TEXT,
      date_to         TEXT,
      records_downloaded INTEGER DEFAULT 0,
      records_new        INTEGER DEFAULT 0,
      status          TEXT DEFAULT 'ok',
      error           TEXT DEFAULT '',
      synced_at       TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function seedDefaultSettings() {
  const defaults = {
    timezone:        'America/Lima',
    hours_per_day:   '8',
    start_time:      '08:00',
    tolerance_min:   '10',
    break_hours:     '1',
    work_days:       '1,2,3,4,5',
    company_name:    'Mi Empresa',
  };
  for (const [k, v] of Object.entries(defaults)) {
    db.run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [k, v]);
  }
}

// ─── Devices ─────────────────────────────────────────────────────────────────
function getDevices() {
  return all('SELECT * FROM devices ORDER BY name');
}

function addDevice(d) {
  const id = require('crypto').randomUUID();
  run('INSERT INTO devices(id,name,ip,port,password,timeout,enabled) VALUES(?,?,?,?,?,?,1)',
    [id, d.name, d.ip, d.port||4370, d.password||0, d.timeout||60]);
  return getDevice(id);
}

function getDevice(id) {
  return get('SELECT * FROM devices WHERE id=?', [id]);
}

function updateDevice(id, d) {
  run('UPDATE devices SET name=?,ip=?,port=?,password=?,timeout=?,enabled=? WHERE id=?',
    [d.name, d.ip, d.port, d.password, d.timeout, d.enabled?1:0, id]);
  return getDevice(id);
}

function deleteDevice(id) {
  run('DELETE FROM devices WHERE id=?', [id]);
}

// ─── Employees ────────────────────────────────────────────────────────────────
function getEmployees(includeArchived = false) {
  const whereClause = includeArchived ? '' : 'WHERE e.archived = 0';
  return all(`
    SELECT e.*, d.name as device_name,
           COALESCE(NULLIF(e.display_name,''), e.name) as effective_name
    FROM employees e
    LEFT JOIN devices d ON d.id = e.device_id
    ${whereClause}
    ORDER BY COALESCE(NULLIF(e.display_name,''), e.name)
  `);
}

function getEmployeeRaw(zkId, deviceId) {
  return get('SELECT * FROM employees WHERE zk_id=? AND device_id=?', [zkId, deviceId]);
}

function upsertEmployee(emp, resetArchived = false) {
  const conflictSet = resetArchived
    ? 'name=excluded.name, archived=0'
    : 'name=excluded.name';
  run(`
    INSERT INTO employees(zk_id,device_id,name,display_name,department,position,schedule,hours_per_day,start_time,end_time,tolerance_min,enabled,archived,night_shift)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,1,0,0)
    ON CONFLICT(zk_id,device_id) DO UPDATE SET ${conflictSet}
  `, [emp.zk_id, emp.device_id, emp.name, emp.display_name||'', emp.department||'', emp.position||'',
      emp.schedule||'regular', emp.hours_per_day||8, emp.start_time||'08:00', emp.end_time||'17:00', emp.tolerance_min||10]);
}

function updateEmployee(id, data) {
  const [zk_id, device_id] = id.split('|');
  const tol = parseInt(data.tolerance_min);
  const hpd = parseFloat(data.hours_per_day);
  run(`UPDATE employees SET display_name=?,name=?,department=?,position=?,schedule=?,hours_per_day=?,start_time=?,end_time=?,tolerance_min=?,enabled=?,night_shift=?
       WHERE zk_id=? AND device_id=?`,
    [data.display_name||'', data.name||'', data.department||'', data.position||'', data.schedule||'regular',
     isNaN(hpd) ? 8 : hpd,
     data.start_time||'08:00', data.end_time||'17:00',
     isNaN(tol) ? 10 : tol,
     data.enabled ? 1 : 0,
     data.night_shift ? 1 : 0,
     zk_id, device_id]);
}

function archiveEmployee(zkId, deviceId) {
  run('UPDATE employees SET archived=1 WHERE zk_id=? AND device_id=?', [zkId, deviceId]);
}

function unarchiveEmployee(zkId, deviceId) {
  run('UPDATE employees SET archived=0 WHERE zk_id=? AND device_id=?', [zkId, deviceId]);
}

function deleteEmployee(zkId, deviceId) {
  db.run('DELETE FROM employee_schedules WHERE zk_id=? AND device_id=?', [zkId, deviceId]);
  run('DELETE FROM employees WHERE zk_id=? AND device_id=?', [zkId, deviceId]);
}

// ─── Employee schedules ───────────────────────────────────────────────────────
function getEmployeeSchedules(zkId, deviceId) {
  return all(
    'SELECT * FROM employee_schedules WHERE zk_id=? AND device_id=? ORDER BY day_of_week',
    [zkId, deviceId]
  );
}

function setEmployeeSchedules(zkId, deviceId, schedules) {
  db.run('DELETE FROM employee_schedules WHERE zk_id=? AND device_id=?', [zkId, deviceId]);
  for (const s of schedules) {
    const tol = parseInt(s.tolerance_min);
    const hpd = parseFloat(s.hours_per_day);
    db.run(`INSERT INTO employee_schedules(zk_id,device_id,day_of_week,start_time,end_time,hours_per_day,tolerance_min,is_work_day)
            VALUES(?,?,?,?,?,?,?,?)`,
      [zkId, deviceId, s.day_of_week,
       s.start_time || '08:00', s.end_time || '17:00',
       isNaN(hpd) ? 8 : hpd,
       isNaN(tol) ? 10 : tol,
       s.is_work_day ? 1 : 0]);
  }
  _save();
}

function getAllEmployeeSchedules() {
  const rows = all('SELECT * FROM employee_schedules');
  const map = {};
  for (const r of rows) {
    const key = `${r.zk_id}|${r.device_id}`;
    if (!map[key]) map[key] = {};
    map[key][r.day_of_week] = r;
  }
  return map;
}

function upsertEmployeeImport(emp, mode) {
  const sql = mode === 'update'
    ? `INSERT INTO employees(zk_id,device_id,name,display_name,department,position,hours_per_day,start_time,end_time,tolerance_min,enabled)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(zk_id,device_id) DO UPDATE SET
         display_name=excluded.display_name, department=excluded.department,
         position=excluded.position, hours_per_day=excluded.hours_per_day,
         start_time=excluded.start_time, end_time=excluded.end_time,
         tolerance_min=excluded.tolerance_min, enabled=excluded.enabled`
    : `INSERT OR IGNORE INTO employees(zk_id,device_id,name,display_name,department,position,hours_per_day,start_time,end_time,tolerance_min,enabled)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`;
  run(sql, [
    emp.zk_id, emp.device_id, emp.name||`Usuario ${emp.zk_id}`,
    emp.display_name||'', emp.department||'', emp.position||'',
    emp.hours_per_day||8, emp.start_time||'08:00', emp.end_time||'17:00',
    emp.tolerance_min||10, emp.enabled !== undefined ? (emp.enabled?1:0) : 1,
  ]);
}

function insertAttendanceImport(deviceId, records, mode) {
  let inserted = 0, skipped = 0;
  const insertFn = mode === 'update'
    ? (r) => { db.run(`INSERT OR REPLACE INTO attendance(device_id,zk_user_id,timestamp_local,timestamp_utc,punch_type,verify_type) VALUES(?,?,?,?,?,?)`, [deviceId, String(r.zk_user_id), r.timestamp_local, r.timestamp_local, r.punch_type||0, 0]); inserted += db.getRowsModified(); }
    : (r) => { db.run(`INSERT OR IGNORE INTO attendance(device_id,zk_user_id,timestamp_local,timestamp_utc,punch_type,verify_type) VALUES(?,?,?,?,?,?)`, [deviceId, String(r.zk_user_id), r.timestamp_local, r.timestamp_local, r.punch_type||0, 0]); const n = db.getRowsModified(); inserted += n; if (!n) skipped++; };
  for (const r of records) { try { insertFn(r); } catch { skipped++; } }
  _save();
  return { inserted, skipped };
}

// ─── Attendance ───────────────────────────────────────────────────────────────
function insertAttendanceRecords(deviceId, records) {
  let newCount = 0;
  for (const r of records) {
    try {
      db.run(`INSERT OR IGNORE INTO attendance(device_id,zk_user_id,timestamp_local,timestamp_utc,punch_type,verify_type)
              VALUES(?,?,?,?,?,?)`,
        [deviceId, String(r.user_id), r.timestamp_local, r.timestamp_utc, r.punch||0, r.status||0]);
      newCount += db.getRowsModified();
    } catch {}
  }
  _save();
  return newCount;
}

function getAttendance(filters = {}) {
  let sql = `
    SELECT a.*, COALESCE(NULLIF(e.display_name,''), e.name) as employee_name, d.name as device_name
    FROM attendance a
    LEFT JOIN employees e ON e.zk_id = a.zk_user_id AND e.device_id = a.device_id
    LEFT JOIN devices d ON d.id = a.device_id
    WHERE 1=1
  `;
  const params = [];
  if (filters.dateFrom) { sql += ' AND date(a.timestamp_local) >= ?'; params.push(filters.dateFrom); }
  if (filters.dateTo)   { sql += ' AND date(a.timestamp_local) <= ?'; params.push(filters.dateTo); }
  if (filters.employeeId) {
    const [zk, dev] = filters.employeeId.split('|');
    sql += ' AND a.zk_user_id=? AND a.device_id=?';
    params.push(zk, dev);
  }
  if (filters.deviceId) { sql += ' AND a.device_id=?'; params.push(filters.deviceId); }
  if (filters.search) {
    sql += ' AND (e.name LIKE ? OR e.display_name LIKE ? OR a.zk_user_id LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  sql += ' ORDER BY a.timestamp_local DESC';
  if (filters.limit) { sql += ` LIMIT ${parseInt(filters.limit)}`; }
  return all(sql, params);
}

function updateAttendanceRecord(id, data) {
  run('UPDATE attendance SET timestamp_local=?, timestamp_utc=?, punch_type=? WHERE id=?',
    [data.timestamp_local, data.timestamp_local, data.punch_type, id]);
}

function deleteAttendance(ids) {
  if (!ids || ids.length === 0) return 0;
  let count = 0;
  for (const id of ids) {
    db.run('DELETE FROM attendance WHERE id=?', [id]);
    count += db.getRowsModified();
  }
  _save();
  return count;
}

function getAttendanceForPayroll(deviceIds, employeeIds, dateFrom, dateTo) {
  let sql = `
    SELECT a.*, COALESCE(NULLIF(e.display_name,''), e.name) as employee_name,
           e.hours_per_day, e.start_time, e.end_time, e.tolerance_min, COALESCE(e.night_shift, 0) as night_shift
    FROM attendance a
    LEFT JOIN employees e ON e.zk_id = a.zk_user_id AND e.device_id = a.device_id
    WHERE date(a.timestamp_local) >= ? AND date(a.timestamp_local) <= ?
  `;
  const params = [dateFrom, dateTo];
  if (deviceIds && deviceIds.length > 0) {
    sql += ` AND a.device_id IN (${deviceIds.map(() => '?').join(',')})`;
    params.push(...deviceIds);
  }
  if (employeeIds && employeeIds.length > 0) {
    sql += ` AND (a.zk_user_id || '|' || a.device_id) IN (${employeeIds.map(() => '?').join(',')})`;
    params.push(...employeeIds);
  }
  sql += ' ORDER BY a.zk_user_id, a.device_id, a.timestamp_local';
  return all(sql, params);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  return {
    total_employees: get('SELECT COUNT(*) as c FROM employees WHERE enabled=1 AND archived=0')?.c || 0,
    total_devices:   get('SELECT COUNT(*) as c FROM devices WHERE enabled=1')?.c || 0,
    records_today:   get('SELECT COUNT(*) as c FROM attendance WHERE date(timestamp_local)=?', [today])?.c || 0,
    last_sync:       get('SELECT MAX(synced_at) as ts FROM sync_log WHERE status="ok"')?.ts || null,
    records_total:   get('SELECT COUNT(*) as c FROM attendance')?.c || 0,
  };
}

function getAttendanceChart() {
  return all(`
    SELECT date(timestamp_local) as day, COUNT(DISTINCT zk_user_id) as employees
    FROM attendance
    WHERE date(timestamp_local) >= date('now', '-14 days')
    GROUP BY day ORDER BY day
  `);
}

// ─── Sync log ─────────────────────────────────────────────────────────────────
function addSyncLog(entry) {
  run(`INSERT INTO sync_log(device_id,device_name,date_from,date_to,records_downloaded,records_new,status,error)
       VALUES(?,?,?,?,?,?,?,?)`,
    [entry.device_id||'', entry.device_name||'', entry.date_from||'', entry.date_to||'',
     entry.records_downloaded||0, entry.records_new||0, entry.status||'ok', entry.error||'']);
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function saveSettings(settings) {
  for (const [k, v] of Object.entries(settings)) {
    db.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [k, String(v)]);
  }
  _save();
}

module.exports = {
  initDatabase, getDbPath,
  getDevices, addDevice, getDevice, updateDevice, deleteDevice,
  getEmployees, upsertEmployee, updateEmployee,
  archiveEmployee, unarchiveEmployee, deleteEmployee,
  getEmployeeSchedules, setEmployeeSchedules, getAllEmployeeSchedules,
  upsertEmployeeImport, insertAttendanceImport,
  insertAttendanceRecords, getAttendance, updateAttendanceRecord, deleteAttendance, getAttendanceForPayroll,
  getDashboardStats, getAttendanceChart,
  addSyncLog,
  getSettings, saveSettings,
};
