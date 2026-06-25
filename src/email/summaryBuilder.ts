import type { WasteItem, Grocer } from "../types.js";
import { totalCents, byCategory, byGrocer, repeatOffenders, projectedAnnualCents, weeklyTrend } from "../domain/stats.js";

export interface EmailSummary {
  periodType: "weekly" | "monthly";
  periodLabel: string; periodStart: string; periodEnd: string;
  totalCents: number; itemCount: number; projectedAnnualCents: number;
  byCategory: { category: string; cents: number }[];
  byGrocer: { grocer: Grocer; cents: number; pct: number }[];
  worstGrocer: { grocer: Grocer; cents: number; pct: number };
  repeatOffenders: { name: string; count: number; cents: number }[];
  items: { name: string; grocer: Grocer; qty: number; cents: number }[];
  trend: { weekStart: string; label: string; cents: number }[];
  photoPaths: string[];
}

export interface BuildSummaryInput {
  periodType: "weekly" | "monthly"; periodLabel: string; periodStart: string; periodEnd: string;
  periodItems: WasteItem[]; allItems: WasteItem[]; tz: string;
}

export function buildSummary(i: BuildSummaryInput): EmailSummary {
  const total = totalCents(i.periodItems);
  const grocers = byGrocer(i.periodItems);
  return {
    periodType: i.periodType, periodLabel: i.periodLabel, periodStart: i.periodStart, periodEnd: i.periodEnd,
    totalCents: total,
    itemCount: i.periodItems.reduce((s, it) => s + it.qty, 0),
    projectedAnnualCents: projectedAnnualCents(total, i.periodType),
    byCategory: byCategory(i.periodItems),
    byGrocer: grocers,
    worstGrocer: grocers[0] ?? { grocer: "whole_foods" as Grocer, cents: 0, pct: 0 },
    repeatOffenders: repeatOffenders(i.periodItems).slice(0, 5),
    items: i.periodItems
      .map(it => ({ name: it.product_name ?? "Unknown item", grocer: it.grocer, qty: it.qty, cents: (it.price_cents ?? 0) * it.qty }))
      .sort((a, b) => b.cents - a.cents),
    trend: weeklyTrend(i.allItems, i.tz),
    photoPaths: i.periodItems.filter(it => it.photo_path).map(it => it.photo_path!),
  };
}
