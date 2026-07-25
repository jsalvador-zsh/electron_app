const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('api', {

  // ── Window controls ───────────────────────────────────────────────────────
  winMinimize:  () => ipcRenderer.send('win:minimize'),
  winMaximize:  () => ipcRenderer.send('win:maximize'),
  winClose:     () => ipcRenderer.send('win:close'),

  // ── Shell ─────────────────────────────────────────────────────────────────
  openPath:     (p)    => ipcRenderer.invoke('shell:openPath', p),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings:  ()     => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (s)    => ipcRenderer.invoke('db:saveSettings', s),

  // ── Devices ───────────────────────────────────────────────────────────────
  getDevices:   ()     => ipcRenderer.invoke('db:getDevices'),
  addDevice:    (d)    => ipcRenderer.invoke('db:addDevice', d),
  updateDevice: (id,d) => ipcRenderer.invoke('db:updateDevice', id, d),
  deleteDevice: (id)   => ipcRenderer.invoke('db:deleteDevice', id),
  testDevice:   (d)    => ipcRenderer.invoke('zk:test', d),

  // ── Employees ─────────────────────────────────────────────────────────────
  getEmployees:            (includeArchived) => ipcRenderer.invoke('db:getEmployees', includeArchived),
  updateEmployee:          (id, d)           => ipcRenderer.invoke('db:updateEmployee', id, d),
  archiveEmployee:         (zkId, deviceId)  => ipcRenderer.invoke('db:archiveEmployee', zkId, deviceId),
  unarchiveEmployee:       (zkId, deviceId)  => ipcRenderer.invoke('db:unarchiveEmployee', zkId, deviceId),
  deleteEmployee:          (zkId, deviceId)  => ipcRenderer.invoke('db:deleteEmployee', zkId, deviceId),
  syncEmployeesFromDevice: (deviceId)        => ipcRenderer.invoke('zk:getUsers', deviceId),

  // ── Employee schedules ────────────────────────────────────────────────────
  getEmployeeSchedules: (zkId, deviceId)           => ipcRenderer.invoke('db:getEmployeeSchedules', zkId, deviceId),
  setEmployeeSchedules: (zkId, deviceId, schedules) => ipcRenderer.invoke('db:setEmployeeSchedules', zkId, deviceId, schedules),

  // ── Attendance ────────────────────────────────────────────────────────────
  downloadAttendance: (params) => ipcRenderer.invoke('zk:download', params),
  getAttendance:      (f)      => ipcRenderer.invoke('db:getAttendance', f),
  updateAttendance:   (id, d)  => ipcRenderer.invoke('db:updateAttendance', id, d),
  deleteAttendance:   (ids)    => ipcRenderer.invoke('db:deleteAttendance', ids),
  getDashboardStats:  ()       => ipcRenderer.invoke('db:getDashboardStats'),
  getAttendanceChart: ()       => ipcRenderer.invoke('db:getAttendanceChart'),

  // ── Payroll ───────────────────────────────────────────────────────────────
  calculatePayroll: (params)   => ipcRenderer.invoke('payroll:calculate', params),
  exportPayrollExcel: (params) => ipcRenderer.invoke('payroll:exportExcel', params),

  // ── Exports / Imports ─────────────────────────────────────────────────────
  openFileDialog:        (opts)   => ipcRenderer.invoke('dialog:openFile', opts),
  exportAttendanceExcel: (params) => ipcRenderer.invoke('attendance:exportExcel', params),
  importAttendanceExcel: (params) => ipcRenderer.invoke('attendance:importExcel', params),
  exportEmployeesExcel:  ()       => ipcRenderer.invoke('employees:exportExcel'),
  importEmployeesExcel:  (params) => ipcRenderer.invoke('employees:importExcel', params),

  // ── Streaming events from main ────────────────────────────────────────────
  onSyncLog: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('sync:log', handler);
    return () => ipcRenderer.removeListener('sync:log', handler);
  },
  onSyncDone: (cb) => {
    const handler = (_e, result) => cb(result);
    ipcRenderer.on('sync:done', handler);
    return () => ipcRenderer.removeListener('sync:done', handler);
  },
});
