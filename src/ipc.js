/**
 * IPC handlers: bridge between renderer (preload API) and Node.js backend.
 */
const path = require('path');
const fs   = require('fs');

let _ipcMain = null;

function setupIPC(ipcMain) {
  _ipcMain = ipcMain;

  const db      = require('./database');
  const zkteco  = require('./zkteco');
  const payroll = require('./payroll');

  // ── Settings ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getSettings',  () => db.getSettings());
  ipcMain.handle('db:saveSettings', (_e, s) => { db.saveSettings(s); return { ok: true }; });

  // ── Devices ─────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getDevices',      ()        => db.getDevices());
  ipcMain.handle('db:addDevice',       (_e, d)   => db.addDevice(d));
  ipcMain.handle('db:updateDevice',    (_e,id,d) => db.updateDevice(id, d));
  ipcMain.handle('db:deleteDevice',    (_e, id)  => { db.deleteDevice(id); return { ok: true }; });

  // ── ZKTeco: test ────────────────────────────────────────────────────────────
  ipcMain.handle('zk:test', async (_e, device) => {
    return await zkteco.testDevice(device);
  });

  // ── ZKTeco: get users from device ────────────────────────────────────────────
  ipcMain.handle('zk:getUsers', async (_e, deviceId) => {
    const device = db.getDevice(deviceId);
    if (!device) throw new Error('Dispositivo no encontrado');
    const users = await zkteco.getUsers(device);
    for (const u of users) {
      db.upsertEmployee({
        zk_id:     String(u.user_id),
        device_id: device.id,
        name:      u.name || `Usuario ${u.user_id}`,
      }, true);
    }
    return users;
  });

  // ── ZKTeco: download attendance ──────────────────────────────────────────────
  ipcMain.handle('zk:download', async (_e, params) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];

    const settings = db.getSettings();
    const timezone = settings.timezone || 'America/Lima';
    const devices  = params.deviceIds
      ? db.getDevices().filter(d => params.deviceIds.includes(d.id) && d.enabled)
      : db.getDevices().filter(d => d.enabled);

    let totalDownloaded = 0, totalNew = 0;
    const results = [];

    for (const device of devices) {
      try {
        win?.webContents.send('sync:log', { level: 'info', msg: `Conectando a ${device.name} (${device.ip})...` });

        const deviceUsers = await zkteco.getUsers(device).catch(() => []);
        const nameMap = {};
        for (const u of deviceUsers) nameMap[String(u.user_id)] = u.name;

        const records = await zkteco.downloadAttendance(device, timezone, params.dateFrom, params.dateTo);
        win?.webContents.send('sync:log', { level: 'info', msg: `${device.name}: ${records.length} registros descargados` });

        const newCount = db.insertAttendanceRecords(device.id, records);
        totalDownloaded += records.length;
        totalNew        += newCount;

        const uniqueIds = [...new Set(records.map(r => String(r.user_id)))];
        for (const uid of uniqueIds) {
          db.upsertEmployee({ zk_id: uid, device_id: device.id, name: nameMap[uid] || `Usuario ${uid}` });
        }

        db.addSyncLog({
          device_id:          device.id,
          device_name:        device.name,
          date_from:          params.dateFrom,
          date_to:            params.dateTo,
          records_downloaded: records.length,
          records_new:        newCount,
          status:             'ok',
        });

        win?.webContents.send('sync:log', { level: 'success', msg: `${device.name}: ${newCount} nuevos guardados` });
        results.push({ device: device.name, downloaded: records.length, new: newCount });
      } catch (err) {
        win?.webContents.send('sync:log', { level: 'error', msg: `${device.name}: ERROR - ${err.message}` });
        db.addSyncLog({ device_id: device.id, device_name: device.name, status: 'error', error: err.message });
        results.push({ device: device.name, error: err.message });
      }
    }

    const summary = { totalDownloaded, totalNew, results };
    win?.webContents.send('sync:done', summary);
    return summary;
  });

  // ── Dialog open file ────────────────────────────────────────────────────────
  ipcMain.handle('dialog:openFile', async (_e, opts) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, opts);
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Employees ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getEmployees', (_e, includeArchived) => db.getEmployees(!!includeArchived));
  ipcMain.handle('db:updateEmployee', (_e, id, d) => { db.updateEmployee(id, d); return { ok: true }; });
  ipcMain.handle('db:archiveEmployee',   (_e, zkId, deviceId) => { db.archiveEmployee(zkId, deviceId);   return { ok: true }; });
  ipcMain.handle('db:unarchiveEmployee', (_e, zkId, deviceId) => { db.unarchiveEmployee(zkId, deviceId); return { ok: true }; });
  ipcMain.handle('db:deleteEmployee',    (_e, zkId, deviceId) => { db.deleteEmployee(zkId, deviceId);    return { ok: true }; });

  // ── Employee schedules ───────────────────────────────────────────────────────
  ipcMain.handle('db:getEmployeeSchedules', (_e, zkId, deviceId) => db.getEmployeeSchedules(zkId, deviceId));
  ipcMain.handle('db:setEmployeeSchedules', (_e, zkId, deviceId, schedules) => {
    db.setEmployeeSchedules(zkId, deviceId, schedules);
    return { ok: true };
  });

  ipcMain.handle('employees:exportExcel', async () => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      title: 'Exportar Empleados',
      defaultPath: `empleados_${new Date().toISOString().split('T')[0]}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled) return { canceled: true };
    await exportEmployeesToExcel(result.filePath);
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('employees:importExcel', async (_e, params) => {
    return await importEmployeesFromExcel(params.filePath, params.mode);
  });

  ipcMain.handle('attendance:importExcel', async (_e, params) => {
    return await importAttendanceFromExcel(params.filePath, params.mode, params.deviceId);
  });

  // ── Attendance ───────────────────────────────────────────────────────────────
  ipcMain.handle('db:getAttendance',       (_e, f)    => db.getAttendance(f));
  ipcMain.handle('db:updateAttendance',    (_e, id, d) => { db.updateAttendanceRecord(id, d); return { ok: true }; });
  ipcMain.handle('db:deleteAttendance',    (_e, ids)  => db.deleteAttendance(ids));
  ipcMain.handle('db:getDashboardStats',   ()          => db.getDashboardStats());
  ipcMain.handle('db:getAttendanceChart',  ()          => db.getAttendanceChart());

  // ── Payroll ──────────────────────────────────────────────────────────────────
  ipcMain.handle('payroll:calculate', async (_e, params) => {
    const settings = db.getSettings();
    // Fetch one extra day so night shift workers' early-morning exit punches are included
    const [py, pm, pd] = params.dateTo.split('-').map(Number);
    const extra = new Date(py, pm - 1, pd + 1);
    const extendedDateTo = `${extra.getFullYear()}-${String(extra.getMonth()+1).padStart(2,'0')}-${String(extra.getDate()).padStart(2,'0')}`;
    const records      = db.getAttendanceForPayroll(
      params.deviceIds, params.employeeIds, params.dateFrom, extendedDateTo
    );
    const schedulesMap = db.getAllEmployeeSchedules();
    return payroll.calculatePayroll(records, params.dateFrom, params.dateTo, settings, schedulesMap);
  });

  ipcMain.handle('payroll:exportExcel', async (_e, params) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      title:       'Exportar Planilla',
      defaultPath: `planilla_${params.dateFrom}_${params.dateTo}.xlsx`,
      filters:     [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled) return { canceled: true };
    await exportPayrollToExcel(params.data, params.dateFrom, params.dateTo, result.filePath, params.columns);
    return { saved: true, path: result.filePath };
  });

  // ── Attendance Excel Export ──────────────────────────────────────────────────
  ipcMain.handle('attendance:exportExcel', async (_e, params) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      title:       'Exportar Asistencia',
      defaultPath: `asistencia_${params.dateFrom}_${params.dateTo}.xlsx`,
      filters:     [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled) return { canceled: true };
    if (params.mode === 'records') {
      await exportRecordsToExcel(params.records, params.dateFrom, params.dateTo, result.filePath, params.columns);
    } else {
      await exportAttendanceToExcel(params.summary, params.dateFrom, params.dateTo, result.filePath, params.columns);
    }
    return { saved: true, path: result.filePath };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _fmtSpan(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, '0')}min`;
}

function _thin() {
  return { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

// ─── Payroll Excel Export ─────────────────────────────────────────────────────
const PAYROLL_COL_DEFS = [
  { key: 'name', header: 'Empleado',       width: 28, val: e => e.employee_name },
  { key: 'pd',   header: 'Días Período',   width: 13, val: e => e.period_days },
  { key: 'dw',   header: 'Días Trab.',     width: 13, val: (e, fh) => e.days_worked },
  { key: 'da',   header: 'Ausencias',      width: 12, val: e => e.days_absent },
  { key: 'di',   header: 'Incompletos',    width: 13, val: e => e.days_incomplete },
  { key: 'dl',   header: 'Tardanzas',      width: 12, val: e => e.days_late },
  { key: 'hn',   header: 'Hrs Normales',   width: 14, val: (e, fh) => fh(e.total_normal_hours) },
  { key: 'he',   header: 'Hrs Extra',      width: 12, val: (e, fh) => fh(e.total_overtime_hours) },
  { key: 'th',   header: 'Total Horas',    width: 12, val: (e, fh) => fh(e.total_hours) },
  { key: 'mt',   header: 'Min Tardanza',   width: 13, val: e => e.total_delay_minutes },
  { key: 'att',  header: '% Asistencia',   width: 13, val: e => `${e.attendance_rate}%` },
];

async function exportPayrollToExcel(data, dateFrom, dateTo, filePath, selectedCols) {
  const ExcelJS = require('exceljs');
  const db      = require('./database');
  const { formatHours } = require('./payroll');

  const settings = db.getSettings();
  const company  = settings.company_name || 'Mi Empresa';

  const cols = selectedCols && selectedCols.length
    ? PAYROLL_COL_DEFS.filter(c => selectedCols.includes(c.key))
    : PAYROLL_COL_DEFS;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZKTeco Desktop';
  wb.created = new Date();

  const ws = wb.addWorksheet('Planilla', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

  const spanEnd = String.fromCharCode(64 + cols.length);

  ws.mergeCells(`A1:${spanEnd}1`);
  Object.assign(ws.getCell('A1'), {
    value:     company.toUpperCase(),
    font:      { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
  });
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${spanEnd}2`);
  Object.assign(ws.getCell('A2'), {
    value:     `PLANILLA DE ASISTENCIA — Período: ${dateFrom} al ${dateTo}`,
    font:      { bold: true, size: 11 },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  });
  ws.getRow(2).height = 18;

  ws.getRow(3).height = 5;

  const hRow = ws.getRow(4);
  hRow.values = cols.map(c => c.header);
  hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  hRow.alignment = { horizontal: 'center', wrapText: true };
  hRow.height    = 22;
  for (let c = 1; c <= cols.length; c++) ws.getCell(4, c).border = _thin();

  let rowNum = 5;
  for (const emp of data) {
    const row = ws.getRow(rowNum);
    row.values = cols.map(c => c.val(emp, formatHours));
    for (let c = 1; c <= cols.length; c++) ws.getCell(rowNum, c).border = _thin();

    const daIdx  = cols.findIndex(c => c.key === 'da')  + 1;
    const dlIdx  = cols.findIndex(c => c.key === 'dl')  + 1;
    const attIdx = cols.findIndex(c => c.key === 'att') + 1;
    if (daIdx > 0 && emp.days_absent > 0)
      ws.getCell(rowNum, daIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
    if (dlIdx > 0 && emp.days_late > 0)
      ws.getCell(rowNum, dlIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    if (attIdx > 0) {
      const attCell = ws.getCell(rowNum, attIdx);
      if (emp.attendance_rate >= 90)      attCell.font = { color: { argb: 'FF166534' }, bold: true };
      else if (emp.attendance_rate >= 70) attCell.font = { color: { argb: 'FF92400E' }, bold: true };
      else                                attCell.font = { color: { argb: 'FF991B1B' }, bold: true };
    }

    rowNum++;
  }

  const totNormal = data.reduce((s, e) => s + e.total_normal_hours,   0);
  const totOT     = data.reduce((s, e) => s + e.total_overtime_hours, 0);
  const TOTAL_VALS = {
    name: 'TOTALES', pd: '', dw: data.reduce((s,e)=>s+e.days_worked,0),
    da: data.reduce((s,e)=>s+e.days_absent,0), di: data.reduce((s,e)=>s+e.days_incomplete,0),
    dl: data.reduce((s,e)=>s+e.days_late,0), hn: formatHours(totNormal), he: formatHours(totOT),
    th: formatHours(totNormal+totOT), mt: data.reduce((s,e)=>s+e.total_delay_minutes,0), att: '',
  };
  const totRow = ws.getRow(rowNum);
  totRow.values = cols.map(c => TOTAL_VALS[c.key] ?? '');
  totRow.font = { bold: true };
  totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  for (let c = 1; c <= cols.length; c++) ws.getCell(rowNum, c).border = _thin();

  const STATUS_BG = {
    ok:         'FFD1FAE5',
    tardanza:   'FFFEF3C7',
    ausente:    'FFFEE2E2',
    incompleto: 'FFF8FAFC',
  };
  const STATUS_LABEL = { ok: 'OK', tardanza: 'Tardanza', ausente: 'Ausente', incompleto: 'Sin salida' };

  for (const emp of data) {
    const sheetName = emp.employee_name.substring(0, 31).replace(/[/\\*?[\]:]/g, '_');
    const wsE = wb.addWorksheet(sheetName);

    wsE.columns = [
      { key: 'date',    width: 13 },
      { key: 'status',  width: 14 },
      { key: 'ci',      width: 11 },
      { key: 'co',      width: 11 },
      { key: 'hours',   width: 13 },
      { key: 'extra',   width: 12 },
      { key: 'delay',   width: 15 },
      { key: 'punches', width: 9  },
    ];

    wsE.mergeCells('A1:H1');
    Object.assign(wsE.getCell('A1'), {
      value:     `${emp.employee_name}   |   Período: ${dateFrom} al ${dateTo}`,
      font:      { bold: true, size: 12 },
      alignment: { horizontal: 'center', vertical: 'middle' },
      fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
    });
    wsE.getRow(1).height = 22;

    wsE.mergeCells('A2:H2');
    Object.assign(wsE.getCell('A2'), {
      value: `Trabajados: ${emp.days_worked}d  |  Ausencias: ${emp.days_absent}d  |  Tardanzas: ${emp.days_late}d  |  Asistencia: ${emp.attendance_rate}%  |  Hrs normales: ${formatHours(emp.total_normal_hours)}  |  Hrs extra: ${formatHours(emp.total_overtime_hours)}`,
      font:  { size: 10, italic: true },
      alignment: { horizontal: 'center' },
    });
    wsE.getRow(2).height = 16;

    const empHRow = wsE.getRow(3);
    empHRow.values = ['Fecha', 'Estado', 'Entrada', 'Salida', 'Horas Trab.', 'Hrs Extra', 'Tardanza (min)', 'Marcas'];
    empHRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    empHRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    empHRow.alignment = { horizontal: 'center' };
    for (let c = 1; c <= 8; c++) wsE.getCell(3, c).border = _thin();

    let r = 4;
    for (const d of emp.details) {
      const row = wsE.getRow(r);
      row.values = [
        d.date,
        STATUS_LABEL[d.status] || d.status,
        d.check_in  ? d.check_in.split(' ')[1].substring(0, 5)  : '—',
        d.check_out ? d.check_out.split(' ')[1].substring(0, 5) : '—',
        d.hours_worked != null ? formatHours(d.hours_worked) : '—',
        (d.overtime != null && d.overtime > 0) ? formatHours(d.overtime) : '—',
        d.delay_minutes || 0,
        d.punch_count   || 0,
      ];
      row.alignment = { horizontal: 'center' };
      const bg = STATUS_BG[d.status] || 'FFFFFFFF';
      for (let c = 1; c <= 8; c++) {
        wsE.getCell(r, c).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        wsE.getCell(r, c).border = _thin();
      }
      r++;
    }
  }

  await wb.xlsx.writeFile(filePath);
}

// ─── Attendance Daily Summary Excel Export ────────────────────────────────────
function _fmtPunch(ts) {
  if (!ts) return '—';
  return (ts.split(' ')[1] || '').substring(0, 5) || '—';
}

const SUMMARY_COL_DEFS = [
  { key: 'employee',    header: 'Empleado',       width: 28, val: r => r.employee_name },
  { key: 'date',        header: 'Fecha',           width: 13, val: r => r.date },
  { key: 'p_entry',     header: 'Entrada',         width: 11, val: r => _fmtPunch(r.p_entry) },
  { key: 'p_lunch_out', header: 'Sal. Almuerzo',   width: 14, val: r => _fmtPunch(r.p_lunch_out) },
  { key: 'p_lunch_in',  header: 'Ret. Almuerzo',   width: 14, val: r => _fmtPunch(r.p_lunch_in) },
  { key: 'p_exit',      header: 'Salida',           width: 11, val: r => _fmtPunch(r.p_exit) },
  { key: 'hours',       header: 'Tiempo Bruto',    width: 14, val: r => r.hours_raw != null ? _fmtSpan(r.hours_raw) : '—' },
  { key: 'punches',     header: 'Marcas',           width: 10, val: r => r.punch_count },
  { key: 'device',      header: 'Dispositivo',      width: 22, val: r => r.device_name },
];

const RECORDS_COL_DEFS = [
  { key: 'employee',   header: 'Empleado',       width: 28, val: r => r.employee_name || `ID ${r.zk_user_id}` },
  { key: 'zk_id',     header: 'ID Biómetro',     width: 13, val: r => r.zk_user_id },
  { key: 'date',       header: 'Fecha',           width: 13, val: r => r.timestamp_local.split(' ')[0] },
  { key: 'time',       header: 'Hora',            width: 11, val: r => r.timestamp_local.split(' ')[1]?.substring(0,5) || '—' },
  { key: 'punch_type', header: 'Tipo Marcación',  width: 17, val: r => ['Entrada','Salida','Sal. Descanso','Ret. Descanso','Extra Entrada','Extra Salida'][r.punch_type] || `Tipo ${r.punch_type}` },
  { key: 'device',     header: 'Dispositivo',     width: 22, val: r => r.device_name || '—' },
];

async function exportAttendanceToExcel(summary, dateFrom, dateTo, filePath, selectedCols) {
  const ExcelJS = require('exceljs');
  const db      = require('./database');
  const settings = db.getSettings();
  const company  = settings.company_name || 'Mi Empresa';

  const cols = selectedCols && selectedCols.length
    ? SUMMARY_COL_DEFS.filter(c => selectedCols.includes(c.key))
    : SUMMARY_COL_DEFS;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZKTeco Desktop';
  wb.created = new Date();

  const ws = wb.addWorksheet('Resumen Asistencia');
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

  const spanEnd = String.fromCharCode(64 + cols.length);

  ws.mergeCells(`A1:${spanEnd}1`);
  Object.assign(ws.getCell('A1'), {
    value:     `${company.toUpperCase()} — ASISTENCIA: ${dateFrom} al ${dateTo}`,
    font:      { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
  });
  ws.getRow(1).height = 24;

  const hRow = ws.getRow(2);
  hRow.values    = cols.map(c => c.header);
  hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  hRow.alignment = { horizontal: 'center' };
  for (let c = 1; c <= cols.length; c++) ws.getCell(2, c).border = _thin();

  let r = 3;
  for (const row of summary) {
    const wsRow = ws.getRow(r);
    wsRow.values = cols.map(c => c.val(row));
    wsRow.alignment = { horizontal: 'center' };
    if (cols[0]?.key === 'employee') wsRow.getCell(1).alignment = { horizontal: 'left' };
    for (let c = 1; c <= cols.length; c++) ws.getCell(r, c).border = _thin();
    if (row.punch_count === 1) {
      for (let c = 1; c <= cols.length; c++)
        ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    }
    r++;
  }

  await wb.xlsx.writeFile(filePath);
}

async function exportRecordsToExcel(records, dateFrom, dateTo, filePath, selectedCols) {
  const ExcelJS = require('exceljs');
  const db      = require('./database');
  const settings = db.getSettings();
  const company  = settings.company_name || 'Mi Empresa';

  const cols = selectedCols && selectedCols.length
    ? RECORDS_COL_DEFS.filter(c => selectedCols.includes(c.key))
    : RECORDS_COL_DEFS;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZKTeco Desktop';
  wb.created = new Date();

  const ws = wb.addWorksheet('Marcaciones');
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const spanEnd = String.fromCharCode(64 + cols.length);

  ws.mergeCells(`A1:${spanEnd}1`);
  Object.assign(ws.getCell('A1'), {
    value:     `${company.toUpperCase()} — MARCACIONES: ${dateFrom} al ${dateTo}`,
    font:      { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
  });
  ws.getRow(1).height = 24;

  const hRow = ws.getRow(2);
  hRow.values    = cols.map(c => c.header);
  hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  hRow.alignment = { horizontal: 'center' };
  for (let c = 1; c <= cols.length; c++) ws.getCell(2, c).border = _thin();

  let r = 3;
  for (const row of records) {
    const wsRow = ws.getRow(r);
    wsRow.values = cols.map(c => c.val(row));
    wsRow.alignment = { horizontal: 'center' };
    if (cols[0]?.key === 'employee') wsRow.getCell(1).alignment = { horizontal: 'left' };
    for (let c = 1; c <= cols.length; c++) ws.getCell(r, c).border = _thin();
    r++;
  }

  await wb.xlsx.writeFile(filePath);
}

async function exportEmployeesToExcel(filePath) {
  const ExcelJS = require('exceljs');
  const db      = require('./database');
  const settings = db.getSettings();
  const company  = settings.company_name || 'Mi Empresa';

  const employees = db.getEmployees();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZKTeco Desktop';
  wb.created = new Date();

  const ws = wb.addWorksheet('Empleados');
  const cols = [
    { header: 'ID Biómetro',      key: 'zk_id',        width: 13 },
    { header: 'Dispositivo ID',   key: 'device_id',     width: 36 },
    { header: 'Dispositivo',      key: 'device_name',   width: 20 },
    { header: 'Alias (display)',  key: 'display_name',  width: 22 },
    { header: 'Nombre biómetro',  key: 'name',          width: 22 },
    { header: 'Departamento',     key: 'department',    width: 18 },
    { header: 'Cargo',            key: 'position',      width: 18 },
    { header: 'Hrs/día',          key: 'hours_per_day', width: 10 },
    { header: 'Hora entrada',     key: 'start_time',    width: 13 },
    { header: 'Hora salida',      key: 'end_time',      width: 13 },
    { header: 'Tolerancia (min)', key: 'tolerance_min', width: 16 },
    { header: 'Activo (1/0)',     key: 'enabled',       width: 12 },
  ];
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

  ws.mergeCells(`A1:L1`);
  Object.assign(ws.getCell('A1'), {
    value: `${company.toUpperCase()} — EMPLEADOS`,
    font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
  });
  ws.getRow(1).height = 24;

  ws.mergeCells('A2:L2');
  Object.assign(ws.getCell('A2'), {
    value: '⚠ Para importar: no modifique "ID Biómetro" ni "Dispositivo ID". El Alias es el nombre personalizado que verá en la app.',
    font: { italic: true, size: 10, color: { argb: 'FF92400E' } },
    alignment: { horizontal: 'left', vertical: 'middle' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
  });
  ws.getRow(2).height = 16;

  const hRow = ws.getRow(3);
  hRow.values = cols.map(c => c.header);
  hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  hRow.alignment = { horizontal: 'center' };
  for (let c = 1; c <= cols.length; c++) ws.getCell(3, c).border = _thin();

  let r = 4;
  for (const e of employees) {
    const row = ws.getRow(r);
    row.values = [e.zk_id, e.device_id, e.device_name||'', e.display_name||'', e.name,
      e.department||'', e.position||'', e.hours_per_day, e.start_time||'08:00',
      e.end_time||'17:00', e.tolerance_min||10, e.enabled ? 1 : 0];
    for (let c = 1; c <= cols.length; c++) ws.getCell(r, c).border = _thin();
    r++;
  }
  await wb.xlsx.writeFile(filePath);
}

async function importEmployeesFromExcel(filePath, mode) {
  const ExcelJS = require('exceljs');
  const db = require('./database');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  let headerRow = null;
  let headerIdx = 0;
  ws.eachRow((row, idx) => {
    if (headerRow) return;
    const vals = row.values.map(v => String(v||'').toLowerCase());
    if (vals.some(v => v.includes('biómetro') || v.includes('biometro') || v === 'id biómetro')) {
      headerRow = row.values.map(v => String(v||'').trim().toLowerCase());
      headerIdx = idx;
    }
  });
  if (!headerRow) throw new Error('No se encontró fila de encabezados. Asegúrate de usar la plantilla de exportación.');

  const col = (keywords) => headerRow.findIndex(h => keywords.some(k => h.includes(k)));
  const idxId     = col(['id biómetro', 'id biometro', 'zk_id']);
  const idxDevId  = col(['dispositivo id', 'device_id']);
  const idxAlias  = col(['alias', 'display']);
  const idxName   = col(['nombre biómetro', 'nombre biometro', 'nombre']);
  const idxDept   = col(['departamento']);
  const idxPos    = col(['cargo']);
  const idxHpd    = col(['hrs', 'horas']);
  const idxStart  = col(['hora entrada', 'start_time']);
  const idxEnd    = col(['hora salida', 'end_time']);
  const idxTol    = col(['tolerancia']);
  const idxEnabled= col(['activo', 'enabled']);

  if (idxId < 0 || idxDevId < 0) throw new Error('Columnas "ID Biómetro" y "Dispositivo ID" son requeridas.');

  let imported = 0, skipped = 0, errors = 0;
  ws.eachRow((row, idx) => {
    if (idx <= headerIdx) return;
    const v = row.values;
    const zkId = String(v[idxId]||'').trim();
    const devId = String(v[idxDevId]||'').trim();
    if (!zkId || !devId || zkId === 'undefined') { skipped++; return; }
    try {
      db.upsertEmployeeImport({
        zk_id:        zkId,
        device_id:    devId,
        name:         idxName >= 0 ? String(v[idxName]||`Usuario ${zkId}`).trim() : `Usuario ${zkId}`,
        display_name: idxAlias >= 0 ? String(v[idxAlias]||'').trim() : '',
        department:   idxDept >= 0 ? String(v[idxDept]||'').trim() : '',
        position:     idxPos >= 0 ? String(v[idxPos]||'').trim() : '',
        hours_per_day: idxHpd >= 0 ? parseFloat(v[idxHpd]) || 8 : 8,
        start_time:   idxStart >= 0 ? String(v[idxStart]||'08:00').trim() : '08:00',
        end_time:     idxEnd >= 0 ? String(v[idxEnd]||'17:00').trim() : '17:00',
        tolerance_min: idxTol >= 0 ? parseInt(v[idxTol]) || 10 : 10,
        enabled:      idxEnabled >= 0 ? (String(v[idxEnabled]||'1').trim() !== '0') : true,
      }, mode);
      imported++;
    } catch { errors++; }
  });
  return { imported, skipped, errors };
}

async function importAttendanceFromExcel(filePath, mode, deviceId) {
  const ExcelJS = require('exceljs');
  const db = require('./database');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  let headerRow = null, headerIdx = 0;
  ws.eachRow((row, idx) => {
    if (headerRow) return;
    const vals = row.values.map(v => String(v||'').toLowerCase().trim());
    if (vals.some(v => v.includes('biómetro') || v.includes('biometro') || v === 'fecha' || v === 'hora')) {
      headerRow = vals;
      headerIdx = idx;
    }
  });
  if (!headerRow) throw new Error('No se encontró fila de encabezados.');

  const col = (keywords) => headerRow.findIndex(h => keywords.some(k => h.includes(k)));
  const idxId    = col(['id biómetro','id biometro','zk_user_id','id']);
  const idxFecha = col(['fecha','date']);
  const idxHora  = col(['hora','time','hour']);
  const idxTipo  = col(['tipo','type','punch']);

  if (idxId < 0 || idxFecha < 0 || idxHora < 0) throw new Error('Columnas requeridas: ID Biómetro, Fecha, Hora.');

  const records = [];
  ws.eachRow((row, idx) => {
    if (idx <= headerIdx) return;
    const v = row.values;
    const zkId = String(v[idxId]||'').trim();
    let fecha = String(v[idxFecha]||'').trim();
    let hora  = String(v[idxHora]||'').trim();
    if (!zkId || !fecha || !hora) return;

    if (v[idxFecha] instanceof Date) fecha = v[idxFecha].toISOString().split('T')[0];
    if (v[idxHora] instanceof Date) hora = v[idxHora].toTimeString().substring(0,5);

    if (hora.length <= 5 && !hora.includes(':')) return;
    hora = hora.substring(0,5);

    const punch_type = idxTipo >= 0 ? (parseInt(v[idxTipo]) || 0) : 0;
    records.push({ zk_user_id: zkId, timestamp_local: `${fecha} ${hora}:00`, punch_type });
  });

  if (!records.length) throw new Error('No se encontraron registros válidos en el archivo.');
  const result = db.insertAttendanceImport(deviceId, records, mode);
  return { ...result, total: records.length };
}

module.exports = { setupIPC };
