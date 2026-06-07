import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import { formatCents } from "../domain/money.js";

const GROCER_LABEL = { whole_foods: "Whole Foods", kroger: "Kroger", target: "Target" } as const;

export function renderEmailHtml(s: EmailSummary, copy: EmailCopy, chartCid: string): string {
  const offenders = s.repeatOffenders.map(o => `<li>${o.name} — ${o.count}× = <b>${formatCents(o.cents)}</b></li>`).join("");
  const cats = s.byCategory.map(c => `<li>${c.category}: ${formatCents(c.cents)}</li>`).join("");
  const tips = copy.tips.map(t => `<li>${t}</li>`).join("");
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222">
  <h1 style="color:#b00020">${copy.headline}</h1>
  <p style="font-size:42px;margin:8px 0"><b>${formatCents(s.totalCents)}</b></p>
  <p style="color:#666">${s.periodLabel} · ${s.itemCount} items · projected <b>${formatCents(s.projectedAnnualCents)}</b>/yr</p>
  <p>${copy.body}</p>
  <img src="cid:${chartCid}" alt="Waste trend" style="max-width:100%"/>
  <h3>Worst store</h3>
  <p>${GROCER_LABEL[s.worstGrocer.grocer]} — ${Math.round(s.worstGrocer.pct)}% of the damage</p>
  <h3>Repeat offenders</h3><ul>${offenders || "<li>None — for once.</li>"}</ul>
  <h3>Where the money rotted</h3><ul>${cats}</ul>
  <h3>Tips (you're welcome)</h3><ul>${tips}</ul>
  </body></html>`;
}
