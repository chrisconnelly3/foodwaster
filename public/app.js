import { BrowserMultiFormatReader } from "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";

const $ = (id) => document.getElementById(id);
let passcode = localStorage.getItem("fw_pass") || "";
let grocer = localStorage.getItem("fw_grocer") || "whole_foods";
const headers = () => ({ "Content-Type": "application/json", "x-passcode": passcode });

function showApp() {
  $("gate").hidden = true; $("tabs").hidden = false;
  selectTab("capture");
  highlightGrocer();
}

$("unlock").onclick = async () => {
  passcode = $("passcode").value.trim();
  const res = await fetch("/api/ledger", { headers: headers() });
  if (res.ok) { localStorage.setItem("fw_pass", passcode); showApp(); }
  else alert("Wrong passcode");
};
if (passcode) {
  fetch("/api/ledger", { headers: headers() }).then(r => { if (r.ok) showApp(); });
}

// Tabs
function selectTab(tab) {
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("active", b.dataset.tab === tab);
  $("capture").hidden = tab !== "capture";
  $("ledger").hidden = tab !== "ledger";
  if (tab === "ledger") loadLedger();
}
for (const b of document.querySelectorAll("#tabs button")) b.onclick = () => selectTab(b.dataset.tab);

// Grocer selection
function highlightGrocer() {
  for (const b of document.querySelectorAll("#grocers button")) b.classList.toggle("sel", b.dataset.g === grocer);
}
for (const b of document.querySelectorAll("#grocers button")) b.onclick = () => {
  grocer = b.dataset.g; localStorage.setItem("fw_grocer", grocer); highlightGrocer();
};

// Capture: barcode
const reader = new BrowserMultiFormatReader();
let scanning = false;
$("scanBtn").onclick = async () => {
  const video = $("video");
  if (scanning) { reader.reset(); video.hidden = true; scanning = false; $("scanBtn").textContent = "📷 Scan barcode"; return; }
  video.hidden = false; scanning = true; $("scanBtn").textContent = "⏹ Stop scanning";
  let handled = false; // ignore the repeated per-frame callbacks; act on the FIRST read only
  reader.decodeFromVideoDevice(null, video, async (result) => {
    if (!result || handled) return;
    handled = true;
    // Auto-close the camera after the first successful scan — reopen to scan the next item.
    reader.reset();
    video.hidden = true; scanning = false; $("scanBtn").textContent = "📷 Scan barcode";
    const code = result.getText();
    navigator.vibrate?.(80);
    $("captureStatus").textContent = `Logged barcode ${code} ✓ (pricing…)`;
    await postCapture({ grocer, capture_type: "barcode", barcode: code });
  });
};

// Capture: photo
$("photoBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const base64 = await fileToBase64(file);
  await postCapture({ grocer, capture_type: "photo", photoBase64: base64 });
  $("captureStatus").textContent = "Photo logged ✓ (pricing…)";
  e.target.value = "";
};

function fileToBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.readAsDataURL(file);
  });
}

async function postCapture(body) {
  const res = await fetch("/api/captures", { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) $("captureStatus").textContent = "Failed to log ✗";
}

// Ledger
let chart;
async function loadLedger() {
  const res = await fetch("/api/ledger", { headers: headers() });
  if (!res.ok) return;
  const d = await res.json();
  $("weekLabel").textContent = d.weekLabel;
  $("weekTotal").textContent = fmt(d.weekTotalCents);
  $("monthTotal").textContent = fmt(d.monthTotalCents);
  $("annual").textContent = fmt(d.projectedAnnualCents);
  $("items").innerHTML = d.recent.map(renderItem).join("");
  for (const el of document.querySelectorAll("[data-edit]")) el.onclick = () => editPrice(Number(el.dataset.edit));
  drawTrend(d.weeklyTrend);
}

function renderItem(i) {
  const price = i.price_cents == null
    ? `<span class="pending">pending…</span>`
    : `${fmt(i.price_cents)} <span class="muted">(${i.price_source})</span>`;
  return `<div class="item"><span>${i.product_name ?? "…"} <span class="muted">${i.grocer}</span></span>
    <span data-edit="${i.id}">${price}</span></div>`;
}

async function editPrice(id) {
  const val = prompt("Set price in dollars (e.g. 5.99):");
  if (!val) return;
  await fetch(`/api/items/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ priceDollars: val }) });
  loadLedger();
}

function drawTrend(trend) {
  const ctx = $("trend");
  chart?.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels: trend.map(t => t.label), datasets: [{ label: "$ / week", data: trend.map(t => t.cents / 100), backgroundColor: "#b00020" }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: "#aaa" } }, x: { ticks: { color: "#aaa" } } } },
  });
}

$("testEmail").onclick = async () => {
  const res = await fetch("/api/email/test", { method: "POST", headers: headers() });
  alert(res.ok ? "Test email " + (await res.json()).status : "Failed");
};

const fmt = (c) => `$${(c / 100).toFixed(2)}`;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
