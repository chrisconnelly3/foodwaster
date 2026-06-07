import type { WasteItem, Grocer } from "../types.js";
import { weekBounds } from "./periods.js";

const lineCents = (i: WasteItem) => (i.price_cents ?? 0) * i.qty;

export function totalCents(items: WasteItem[]): number {
  return items.reduce((s, i) => s + lineCents(i), 0);
}

export function byCategory(items: WasteItem[]): { category: string; cents: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.category ?? "other", (m.get(i.category ?? "other") ?? 0) + lineCents(i));
  return [...m.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
}

export function byGrocer(items: WasteItem[]): { grocer: Grocer; cents: number; pct: number }[] {
  const total = totalCents(items) || 1;
  const m = new Map<Grocer, number>();
  for (const i of items) m.set(i.grocer, (m.get(i.grocer) ?? 0) + lineCents(i));
  return [...m.entries()].map(([grocer, cents]) => ({ grocer, cents, pct: (cents / total) * 100 })).sort((a, b) => b.cents - a.cents);
}

export function repeatOffenders(items: WasteItem[]): { name: string; count: number; cents: number }[] {
  const m = new Map<string, { count: number; cents: number }>();
  for (const i of items) {
    const name = i.product_name ?? "Unknown";
    const cur = m.get(name) ?? { count: 0, cents: 0 };
    cur.count += 1; cur.cents += lineCents(i); m.set(name, cur);
  }
  return [...m.entries()].map(([name, v]) => ({ name, ...v }))
    .filter(x => x.count > 1).sort((a, b) => b.cents - a.cents);
}

export function projectedAnnualCents(periodTotal: number, period: "weekly" | "monthly"): number {
  return period === "weekly" ? periodTotal * 52 : periodTotal * 12;
}

export function weeklyTrend(items: WasteItem[], tz: string): { weekStart: string; label: string; cents: number }[] {
  const m = new Map<string, { label: string; cents: number }>();
  for (const i of items) {
    const b = weekBounds(new Date(i.captured_at), tz);
    const cur = m.get(b.startIso) ?? { label: b.label, cents: 0 };
    cur.cents += lineCents(i); m.set(b.startIso, cur);
  }
  return [...m.entries()].map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
