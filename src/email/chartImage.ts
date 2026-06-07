import type { EmailSummary } from "./summaryBuilder.js";

/** Render the weekly-waste trend as a PNG via QuickChart.io (no native deps). */
export async function renderTrendPng(s: EmailSummary, fetchFn = fetch): Promise<Buffer> {
  const chart = {
    type: "bar",
    data: {
      labels: s.trend.map(t => t.label),
      datasets: [{ label: "$ wasted per week", data: s.trend.map(t => t.cents / 100), backgroundColor: "#b00020" }],
    },
    options: { plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } },
  };
  const url = `https://quickchart.io/chart?w=600&h=300&bkg=white&c=${encodeURIComponent(JSON.stringify(chart))}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`quickchart ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
