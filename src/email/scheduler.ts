import { weekBounds, monthBounds } from "../domain/periods.js";

export interface DueReport {
  periodType: "weekly" | "monthly";
  periodStart: string; periodEnd: string; periodLabel: string;
}

export function dueReports(
  now: Date, tz: string,
  alreadySent: (periodType: "weekly" | "monthly", periodStart: string) => boolean,
): DueReport[] {
  const out: DueReport[] = [];
  const isMonday = ((now.getUTCDay() + 6) % 7) === 0;
  const isFirst = now.getUTCDate() === 1;

  if (isMonday) {
    const priorWeekDay = new Date(now); priorWeekDay.setUTCDate(now.getUTCDate() - 1);
    const w = weekBounds(priorWeekDay, tz);
    if (!alreadySent("weekly", w.startIso)) {
      out.push({ periodType: "weekly", periodStart: w.startIso, periodEnd: w.endIso, periodLabel: w.label });
    }
  }
  if (isFirst) {
    const priorMonthDay = new Date(now); priorMonthDay.setUTCDate(0); // last day of prior month
    const m = monthBounds(priorMonthDay, tz);
    if (!alreadySent("monthly", m.startIso)) {
      out.push({ periodType: "monthly", periodStart: m.startIso, periodEnd: m.endIso, periodLabel: m.label });
    }
  }
  return out;
}
