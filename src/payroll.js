/**
 * Payroll calculation engine.
 *
 * Punch pairing model:
 *   P1=entry  P2=exit  P3=lunch-return  P4=final-exit  (and so on)
 *   Hours = (P2-P1) + (P4-P3) + ...  → lunch gap is naturally excluded.
 *
 * Special cases:
 *   0 punches  → absent
 *   1 punch    → incomplete (only entry, no exit)
 *   2 punches  → normal day  (P2-P1), subtract break_hours if configured
 *   3 punches  → paired morning (P2-P1), afternoon entry (P3) without exit → incomplete
 *   4 punches  → full paired day (P2-P1)+(P4-P3), break excluded naturally
 *   5+ punches → sum all complete pairs, flag incomplete if odd count
 *
 * Per-employee schedules:
 *   schedulesMap: { 'zkId|deviceId': { dow: { start_time, end_time, hours_per_day, tolerance_min, is_work_day } } }
 *   If a day-of-week entry exists, it overrides the employee's default.
 *   is_work_day = 0 means that day is off for this employee regardless of global work_days.
 *   is_work_day = 1 means that day IS a work day even if not in global work_days.
 *   If no entry for a dow, global work_days applies.
 */

const WORK_DAYS_DEFAULT = [1, 2, 3, 4, 5]; // Mon–Fri

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseDatetime(str) {
  const [datePart, timePart] = str.split(' ');
  const [y, mo, d]  = datePart.split('-').map(Number);
  const [h, mi, s]  = (timePart || '00:00:00').split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

function formatHours(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// For night shift workers: a punch before 14:00 belongs to the previous calendar day's shift
function getShiftDate(timestampLocal, isNightShift) {
  const [date, time] = timestampLocal.split(' ');
  if (!isNightShift) return date;
  const hour = parseInt((time || '00').split(':')[0]);
  if (hour < 14) {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  return date;
}

function dateStr(date) {
  return date.toISOString().split('T')[0];
}

// Determine work days for a specific employee, accounting for custom per-day schedules
function getEmployeeWorkdays(dateFrom, dateTo, globalWorkDays, empSchedules) {
  const days = [];
  let cur = parseDate(dateFrom);
  const end = parseDate(dateTo);
  while (cur <= end) {
    const dow = cur.getDay();
    const customDay = empSchedules ? empSchedules[dow] : undefined;
    let isWorkDay;
    if (customDay !== undefined) {
      isWorkDay = customDay.is_work_day === 1;
    } else {
      isWorkDay = globalWorkDays.includes(dow);
    }
    if (isWorkDay) days.push(dateStr(cur));
    cur = addDays(cur, 1);
  }
  return days;
}

// Kept for backwards compatibility (global work days without per-employee schedule)
function getWorkdays(from, to, workDays = WORK_DAYS_DEFAULT) {
  return getEmployeeWorkdays(from, to, workDays, null);
}

/**
 * Calculate worked hours for one day by pairing consecutive punches.
 * Returns { hours, pairsIncomplete }
 */
function calcDayHours(sortedPunches, breakHours) {
  const n = sortedPunches.length;

  let totalMs = 0;
  const completePairs = Math.floor(n / 2);

  for (let i = 0; i < completePairs; i++) {
    const entry = parseDatetime(sortedPunches[i * 2].timestamp_local);
    const exit  = parseDatetime(sortedPunches[i * 2 + 1].timestamp_local);
    totalMs += Math.max(0, exit - entry);
  }

  let hours = totalMs / 3600000;

  // Only deduct break when exactly 2 punches (no lunch punches — single session all day)
  if (sortedPunches.length === 2 && breakHours > 0) {
    hours = Math.max(0, hours - breakHours);
  }

  return {
    hours,
    pairsIncomplete: n % 2 !== 0,
    checkIn:  sortedPunches[0].timestamp_local,
    checkOut: sortedPunches[n - 1].timestamp_local,
  };
}

function calculatePayroll(records, dateFrom, dateTo, settings, schedulesMap = {}) {
  const workDays            = (settings.work_days || '1,2,3,4,5').split(',').map(Number);
  const defaultHoursPerDay  = parseFloat(settings.hours_per_day  || 8);
  const defaultBreakHours   = parseFloat(settings.break_hours    || 1);
  const defaultStartTime    = settings.start_time    || '08:00';
  const defaultToleranceMin = parseInt(settings.tolerance_min    || 10);

  // Group records by employee, then by shift date
  const byEmployee = {};
  for (const rec of records) {
    const key = `${rec.zk_user_id}|${rec.device_id}`;
    if (!byEmployee[key]) {
      const tol = parseInt(rec.tolerance_min);
      const hpd = parseFloat(rec.hours_per_day);
      byEmployee[key] = {
        key,
        zk_user_id:    rec.zk_user_id,
        device_id:     rec.device_id,
        employee_name: rec.employee_name || `ID ${rec.zk_user_id}`,
        hours_per_day: isNaN(hpd) ? defaultHoursPerDay : hpd,
        start_time:    rec.start_time || defaultStartTime,
        tolerance_min: isNaN(tol) ? defaultToleranceMin : tol,
        night_shift:   rec.night_shift ? 1 : 0,
        days: {},
      };
    }
    const isNightShift = byEmployee[key].night_shift === 1;
    const day = getShiftDate(rec.timestamp_local, isNightShift);
    if (!byEmployee[key].days[day]) byEmployee[key].days[day] = [];
    byEmployee[key].days[day].push(rec);
  }

  const results = Object.values(byEmployee)
    .map(emp => {
      const empSchedules = schedulesMap[emp.key] || null;
      const workdayList  = getEmployeeWorkdays(dateFrom, dateTo, workDays, empSchedules);
      return calcEmployeeSummary(emp, workdayList, defaultBreakHours, empSchedules);
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));

  return results;
}

function calcEmployeeSummary(emp, workdayList, defaultBreakHours, empSchedules) {
  let daysWorked = 0, daysAbsent = 0, daysIncomplete = 0, daysLate = 0;
  let totalNormal = 0, totalOvertime = 0, totalDelayMin = 0;
  const details = [];

  for (const day of workdayList) {
    // Resolve per-day schedule (custom override or employee default)
    const dow = parseDate(day).getDay();
    const daySchedule = empSchedules ? empSchedules[dow] : null;
    const startTime   = daySchedule?.start_time   || emp.start_time;
    const hoursPerDay = daySchedule?.hours_per_day != null ? daySchedule.hours_per_day : emp.hours_per_day;
    const toleranceMin = daySchedule?.tolerance_min != null ? daySchedule.tolerance_min : emp.tolerance_min;

    const punches = (emp.days[day] || [])
      .slice()
      .sort((a, b) => a.timestamp_local < b.timestamp_local ? -1 : 1);

    // ── 0 punches: absent ──────────────────────────────────────────────────
    if (punches.length === 0) {
      daysAbsent++;
      details.push({ date: day, status: 'ausente', punch_count: 0 });
      continue;
    }

    // ── 1 punch: incomplete (only entry) ──────────────────────────────────
    if (punches.length === 1) {
      daysIncomplete++;
      details.push({
        date: day, status: 'incompleto',
        check_in:    punches[0].timestamp_local,
        check_out:   null,
        punch_count: 1,
        hours_worked: null,
        normal_hours: 0,
        overtime:     0,
        delay_minutes: 0,
      });
      continue;
    }

    // ── 2+ punches: calculate by pairing ──────────────────────────────────
    const { hours: hoursWorked, pairsIncomplete, checkIn, checkOut } =
      calcDayHours(punches, defaultBreakHours);

    const normalHours = Math.min(hoursWorked, hoursPerDay);
    const overtime    = Math.max(0, hoursWorked - hoursPerDay);

    // Tardanza: compare first punch vs expected start time
    const firstPunch = parseDatetime(punches[0].timestamp_local);
    const [startH, startM] = startTime.split(':').map(Number);
    const expectedStart = new Date(firstPunch);
    expectedStart.setHours(startH, startM, 0, 0);
    const delayMin = Math.max(
      0,
      Math.floor((firstPunch - expectedStart) / 60000) - toleranceMin
    );
    const isLate = delayMin > 0;

    if (pairsIncomplete) {
      daysIncomplete++;
    } else {
      daysWorked++;
    }

    totalNormal   += normalHours;
    totalOvertime += overtime;
    if (isLate) { daysLate++; totalDelayMin += delayMin; }

    details.push({
      date:          day,
      status:        pairsIncomplete ? 'incompleto' : (isLate ? 'tardanza' : 'ok'),
      check_in:      checkIn,
      check_out:     checkOut,
      punch_count:   punches.length,
      hours_worked:  hoursWorked,
      normal_hours:  normalHours,
      overtime,
      delay_minutes: delayMin,
      schedule_used: { startTime, hoursPerDay, toleranceMin },
    });
  }

  return {
    key:           emp.key,
    zk_user_id:    emp.zk_user_id,
    device_id:     emp.device_id,
    employee_name: emp.employee_name,
    period_days:   workdayList.length,
    days_worked:   daysWorked,
    days_absent:   daysAbsent,
    days_incomplete: daysIncomplete,
    days_late:     daysLate,
    total_normal_hours:   totalNormal,
    total_overtime_hours: totalOvertime,
    total_hours:          totalNormal + totalOvertime,
    total_delay_minutes:  totalDelayMin,
    attendance_rate:      workdayList.length
      ? Math.round((daysWorked / workdayList.length) * 100) : 0,
    details,
  };
}

module.exports = { calculatePayroll, getWorkdays, getEmployeeWorkdays, formatHours };
