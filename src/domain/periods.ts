export interface PeriodBounds { startIso: string; endIso: string; label: string; }

function atMidnightUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function weekBounds(now: Date, _tz: string): PeriodBounds {
  const day = atMidnightUtc(now);
  const dow = (day.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const start = new Date(day); start.setUTCDate(day.getUTCDate() - dow);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 7);
  return { startIso: start.toISOString(), endIso: end.toISOString(), label: rangeLabel(start, new Date(end.getTime() - 1)) };
}

export function monthBounds(now: Date, _tz: string): PeriodBounds {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString(), label: monthLabel(start) };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function rangeLabel(a: Date, b: Date): string {
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
}
function monthLabel(a: Date): string { return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`; }
