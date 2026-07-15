// "Open now", the single most load-bearing piece of logic on the page.
// Pure functions, no dependencies. Imported by the Node unit test AND inlined
// verbatim into dist/index.html (build.mjs strips the trailing `export`).
//
// hours: 7-element array, MONDAY FIRST. Each element is one of:
//   null            -> hours unknown
//   []              -> closed that day
//   [[s,e], ...]    -> open intervals, minutes from local midnight.
//                      An interval past midnight has 1440 added to its end,
//                      e.g. [1080,1500] = 18:00 -> 01:00 next day.

// Day/minute of a given instant in Europe/Rome, as a MONDAY-FIRST index.
// getDay() is Sunday-first; the Monday-first shift is (idx + 6) % 7.
const ROME = 'Europe/Rome';
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function romeNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ROME, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  let wd = 'Mon', hh = 0, mm = 0;
  for (const p of parts) {
    if (p.type === 'weekday') wd = p.value;
    else if (p.type === 'hour') hh = Number(p.value) % 24; // '24' -> 0
    else if (p.type === 'minute') mm = Number(p.value);
  }
  return { day: WD[wd], minutes: hh * 60 + mm };
}

// Core state machine. Returns one of:
//   { state: 'open',    until: <minute 0-1439> }
//   { state: 'opens',   at:    <minute 0-1439> }
//   { state: 'closed' }
//   { state: 'unknown' }
export function openState(hours, day, minutes) {
  if (!Array.isArray(hours) || hours.length !== 7) return { state: 'unknown' };
  const today = hours[day];
  if (today == null) return { state: 'unknown' };

  // 1) Open right now, from an interval that started TODAY.
  if (Array.isArray(today)) {
    for (const [s, e] of today) {
      if (minutes >= s && minutes < e) return { state: 'open', until: e % 1440 };
    }
  }
  // 2) Open right now, spilling over from YESTERDAY past midnight.
  const yday = hours[(day + 6) % 7];
  if (Array.isArray(yday)) {
    for (const [, e] of yday) {
      if (e > 1440 && minutes < e - 1440) return { state: 'open', until: (e - 1440) % 1440 };
    }
  }
  // 3) Not open. Is there a later opening TODAY?
  if (Array.isArray(today)) {
    let next = null;
    for (const [s] of today) {
      if (s > minutes && (next === null || s < next)) next = s;
    }
    if (next !== null) return { state: 'opens', at: next % 1440 };
  }
  // 4) Nothing more today.
  return { state: 'closed' };
}

// Convenience wrappers.
export function isOpen(hours, day, minutes) {
  return openState(hours, day, minutes).state === 'open';
}

export function fmtMinutes(m) {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60), n = mm % 60;
  return String(h).padStart(2, '0') + ':' + String(n).padStart(2, '0');
}

// Render one interval as "18:00–01:00", handling the past-midnight end.
export function fmtInterval([s, e]) {
  return fmtMinutes(s) + '–' + fmtMinutes(e);
}
