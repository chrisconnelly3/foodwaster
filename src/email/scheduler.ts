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
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "numeric" }).formatToParts(now);
  const dayName = parts.find(p => p.type === "weekday")!.value;
  const dayNum = Number(parts.find(p => p.type === "day")!.value);
  const isMonday = dayName === "Mon";
  const isFirst = dayNum === 1;

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
