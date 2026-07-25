/**
 * ZKTeco bridge using node-zklib (pure Node.js, no Python required)
 */
const ZKLib = require('node-zklib');

function createClient(device) {
  return new ZKLib(
    device.ip,
    parseInt(device.port) || 4370,
    (parseInt(device.timeout) || 60) * 1000,
    5200
  );
}

async function testDevice(device) {
  const zk = createClient(device);
  try {
    await zk.createSocket();
    const info = await zk.getInfo();
    return {
      firmware: `Usuarios: ${info.userCounts} | Registros: ${info.logCounts}/${info.logCapacity}`,
      users: info.userCounts,
    };
  } finally {
    try { await zk.disconnect(); } catch (_) {}
  }
}

async function getUsers(device) {
  const zk = createClient(device);
  try {
    await zk.createSocket();
    const { data: users } = await zk.getUsers();
    return (users || []).map(u => ({
      user_id:   String(u.userId),
      name:      (u.name || '').trim() || `Usuario ${u.userId}`,
      privilege: u.role || 0,
      card:      u.cardno ? String(u.cardno) : '',
    }));
  } finally {
    try { await zk.disconnect(); } catch (_) {}
  }
}

async function downloadAttendance(device, timezone, dateFrom, dateTo) {
  const zk = createClient(device);
  try {
    await zk.createSocket();
    const { data: attendances } = await zk.getAttendances();

    let records = (attendances || []).filter(a => a && a.deviceUserId && a.recordTime).map(a => ({
      user_id:         String(a.deviceUserId),
      timestamp_local: formatDate(a.recordTime),
      timestamp_utc:   toUTC(a.recordTime, timezone),
      punch:           0,
      status:          0,
    }));

    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;
      records = records.filter(r => {
        const d = new Date(r.timestamp_local);
        return (!from || d >= from) && (!to || d <= to);
      });
    }

    return records;
  } finally {
    try { await zk.disconnect(); } catch (_) {}
  }
}

function formatDate(dt) {
  const p = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} `
       + `${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

function toUTC(dt, timezone) {
  try {
    const local  = new Date(dt.toLocaleString('en-US', { timeZone: timezone }));
    const offset = dt.getTime() - local.getTime();
    return formatDate(new Date(dt.getTime() + offset));
  } catch (_) {
    return formatDate(dt);
  }
}

module.exports = { testDevice, getUsers, downloadAttendance };
