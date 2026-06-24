import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import { formatCents } from "../domain/money.js";
import { GROCER_LABEL } from "../domain/grocers.js";
import { trendChartUrl } from "./chartImage.js";

const INK = "#241c19";
const PAPER = "#f4efe6";
const RED = "#b00020";
const RED_DARK = "#7c0016";
const GOLD = "#c98a12";
const MUTED = "#8a8079";
const HAIR = "#e8ded0";

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Email-safe horizontal bar built from table cells (works in Gmail/Outlook). */
function bar(pct: number, color: string): string {
  const p = Math.max(2, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed">
    <tr><td height="8" style="background:${color};border-radius:6px;font-size:0;line-height:0;width:${p}%">&nbsp;</td>
    <td height="8" style="font-size:0;line-height:0;width:${100 - p}%">&nbsp;</td></tr></table>`;
}

function sectionTitle(text: string): string {
  return `<p style="margin:0 0 12px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:${GOLD}">${esc(text)}</p>`;
}

export function renderEmailHtml(s: EmailSummary, copy: EmailCopy): string {
  const periodWord = s.periodType === "weekly" ? "week" : "month";

  const offenders = s.repeatOffenders.length
    ? s.repeatOffenders.map((o) => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid ${HAIR};font:400 15px/1.3 Helvetica,Arial,sans-serif;color:${INK}">
            ${esc(o.name)} <span style="color:${MUTED};font-size:13px">×${o.count}</span>
          </td>
          <td align="right" style="padding:9px 0;border-bottom:1px solid ${HAIR};font:700 15px/1.3 Georgia,serif;color:${RED};white-space:nowrap">${formatCents(o.cents)}</td>
        </tr>`).join("")
    : `<tr><td style="padding:9px 0;font:400 15px/1.3 Helvetica,Arial,sans-serif;color:${MUTED}">None repeated — for once.</td></tr>`;

  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.cents));
  const cats = s.byCategory.map((c) => `
      <tr><td style="padding:10px 0 4px;font:400 14px/1.2 Helvetica,Arial,sans-serif;color:${INK}">
        ${esc(cap(c.category))}<span style="float:right;font-weight:700;font-family:Georgia,serif;color:${INK}">${formatCents(c.cents)}</span>
      </td></tr>
      <tr><td style="padding-bottom:10px">${bar((c.cents / maxCat) * 100, "#d98a94")}</td></tr>`).join("");

  const tips = copy.tips.map((t) => `
      <tr>
        <td valign="top" width="26" style="font:700 15px/1.5 Georgia,serif;color:${GOLD}">&bull;</td>
        <td style="font:400 15px/1.5 Helvetica,Arial,sans-serif;color:${INK};padding-bottom:8px">${esc(t)}</td>
      </tr>`).join("");

  const chartBlock = s.trend.length > 0 ? `
      <tr><td style="padding:8px 36px 28px">
        ${sectionTitle("Trend")}
        <img src="${trendChartUrl(s)}" alt="Weekly waste trend" width="528" style="display:block;width:100%;max-width:528px;border:0;outline:none"/>
      </td></tr>` : "";

  const preheader = `${formatCents(s.totalCents)} thrown away this ${periodWord} — projected ${formatCents(s.projectedAnnualCents)}/yr.`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER}">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}">
    <tr><td align="center" style="padding:28px 14px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${HAIR};border-radius:18px;overflow:hidden">

        <tr><td style="background:${RED_DARK};padding:18px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font:700 16px/1 Georgia,serif;letter-spacing:.04em;color:#ffffff">
              <img src="https://foodwaster.fly.dev/icon-192.png" width="26" height="26" alt="" style="vertical-align:middle;border-radius:6px;margin-right:9px">FoodWaster
            </td>
            <td align="right" style="font:600 10px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#f0b8c0">Monthly report</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:40px 36px 8px;text-align:center">
          <p style="margin:0 0 6px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${MUTED}">${esc(s.periodLabel)}</p>
          <p style="margin:0;font:400 13px/1.4 Helvetica,Arial,sans-serif;color:${MUTED}">thrown straight into the trash this ${periodWord}</p>
          <p style="margin:6px 0 0;font:700 76px/1 Georgia,serif;color:${RED};letter-spacing:-.02em">${formatCents(s.totalCents)}</p>
          <p style="margin:10px 0 0;font:400 14px/1.4 Helvetica,Arial,sans-serif;color:${INK}">across <b>${s.itemCount}</b> item${s.itemCount === 1 ? "" : "s"}</p>
        </td></tr>

        <tr><td style="padding:18px 36px 6px">
          <p style="margin:0;font:700 20px/1.35 Georgia,serif;color:${INK};text-align:center">${esc(copy.headline)}</p>
        </td></tr>
        <tr><td style="padding:6px 40px 26px">
          <p style="margin:0;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:#4b423c;text-align:center">${esc(copy.body)}</p>
        </td></tr>

        <tr><td style="padding:0 28px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:14px">
            <tr><td style="padding:20px 26px;text-align:center">
              <p style="margin:0 0 4px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#b9ad9c">At this rate, per year</p>
              <p style="margin:0;font:700 40px/1 Georgia,serif;color:${GOLD}">${formatCents(s.projectedAnnualCents)}</p>
            </td></tr>
          </table>
        </td></tr>

        ${chartBlock}

        <tr><td style="padding:8px 36px 4px">
          ${sectionTitle("Worst store")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font:400 16px/1.3 Helvetica,Arial,sans-serif;color:${INK}">${esc(GROCER_LABEL[s.worstGrocer.grocer])}</td>
            <td align="right" style="font:700 16px/1.3 Georgia,serif;color:${RED}">${Math.round(s.worstGrocer.pct)}%</td>
          </tr></table>
          <div style="padding-top:8px">${bar(s.worstGrocer.pct, RED)}</div>
          <p style="margin:8px 0 0;font:400 13px/1.4 Helvetica,Arial,sans-serif;color:${MUTED}">of the damage came from one store.</p>
        </td></tr>

        <tr><td style="padding:26px 36px 4px">
          ${sectionTitle("Where the money rotted")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cats || `<tr><td style="font:400 14px Helvetica,Arial,sans-serif;color:${MUTED}">No categories recorded.</td></tr>`}</table>
        </td></tr>

        <tr><td style="padding:26px 36px 4px">
          ${sectionTitle("Repeat offenders")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${offenders}</table>
        </td></tr>

        <tr><td style="padding:26px 36px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};border-radius:14px">
            <tr><td style="padding:20px 22px">
              ${sectionTitle("Tips (you're welcome)")}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tips}</table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:22px 28px 30px;border-top:1px solid ${HAIR}">
          <p style="margin:0;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:${MUTED};text-align:center">
            Sent by FoodWaster — your automatic monthly food-waste reckoning.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}
