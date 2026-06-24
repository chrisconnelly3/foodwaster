import type { EmailSummary } from "./summaryBuilder.js";

/**
 * Build a QuickChart.io image URL for the weekly-waste trend. Embedded directly as an
 * <img src> in the email so it renders inline in Gmail/Apple Mail (a `cid:` attachment
 * showed as a broken image + a separate attachment in Gmail).
 */
export function trendChartUrl(s: EmailSummary): string {
  const chart = {
    type: "bar",
    data: {
      labels: s.trend.map((t) => t.label),
      datasets: [{
        label: "$ wasted",
        data: s.trend.map((t) => Number((t.cents / 100).toFixed(2))),
        backgroundColor: "#b00020",
        borderRadius: 6,
        maxBarThickness: 46,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "#ece4d8" }, ticks: { color: "#9a8f82" } },
        x: { grid: { display: false }, ticks: { color: "#9a8f82" } },
      },
    },
  };
  return `https://quickchart.io/chart?w=560&h=260&bkg=transparent&c=${encodeURIComponent(JSON.stringify(chart))}`;
}
