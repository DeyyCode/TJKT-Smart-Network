// =============================================
// TJKT Smart Network — Speed Test Engine
// =============================================

const CDN_TEST_URL = 'https://speed.cloudflare.com/__down?bytes=';
const UPLOAD_URL   = 'https://httpbin.org/post';
const IP_API_URL   = 'https://ipapi.co/json/';

let isRunning = false;

// --- DOM refs ---
const btnStart      = document.getElementById('btn-start');
const statusText    = document.getElementById('status-text');
const gaugeBar      = document.getElementById('gauge-bar');
const gaugeValue    = document.getElementById('gauge-value');
const gaugeLabel    = document.getElementById('gauge-label');
const valPing       = document.getElementById('val-ping');
const valDownload   = document.getElementById('val-download');
const valUpload     = document.getElementById('val-upload');
const ipAddr        = document.getElementById('ip-addr');
const ispName       = document.getElementById('isp-name');
const cityName      = document.getElementById('city-name');
const connectionType= document.getElementById('connection-type');
const progressBar   = document.getElementById('progress-bar');
const resultPanel   = document.getElementById('result-panel');

// --- Helper: sleep ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Helper: animate number counter ---
function animateValue(el, from, to, unit, duration = 800) {
  const start = performance.now();
  const update = (time) => {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const val = from + (to - from) * ease;
    el.textContent = val.toFixed(unit === 'ms' ? 0 : 2) + ' ' + unit;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// --- Helper: update gauge ---
function setGauge(value, max, label) {
  const pct = Math.min(value / max, 1);
  const circumference = 502;
  const offset = circumference - pct * circumference;
  gaugeBar.style.strokeDashoffset = offset;
  gaugeValue.textContent = value.toFixed(label === 'ms' ? 0 : 1);
  gaugeLabel.textContent = label === 'ms' ? 'ms' : 'Mbps';
}


// --- Measure Ping ---
async function measurePing(rounds = 5) {
  setStatus('Mengukur Ping...', 10);
  let total = 0;
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    try {
      await fetch('https://speed.cloudflare.com/__down?bytes=1', { cache: 'no-store' });
    } catch (_) {}
    const t1 = performance.now();
    total += (t1 - t0);
    await sleep(100);
  }
  const avg = total / rounds;
  animateValue(valPing, 0, avg, 'ms');
  setGauge(avg, 200, 'ms');
  return avg;
}

// --- Measure Download ---
async function measureDownload() {
  setStatus('Mengukur Download...', 35);
  const sizes = [5000000, 10000000, 25000000]; // 5MB, 10MB, 25MB
  let totalBits = 0;
  let totalTime = 0;
  for (const size of sizes) {
    const t0 = performance.now();
    try {
      const res = await fetch(CDN_TEST_URL + size, { cache: 'no-store' });
      await res.arrayBuffer();
    } catch (_) { continue; }
    const t1 = performance.now();
    totalBits += size * 8;
    totalTime += (t1 - t0) / 1000;
  }
  const mbps = totalTime > 0 ? (totalBits / totalTime) / 1_000_000 : 0;
  animateValue(valDownload, 0, mbps, 'Mbps');
  setGauge(mbps, 200, 'Mbps');
  return mbps;
}

// --- Measure Upload ---
async function measureUpload(downloadMbps) {
  setStatus('Mengukur Upload...', 70);
  const chunkSize = 2 * 1024 * 1024; // 2MB
  const blob = new Blob([new ArrayBuffer(chunkSize)]);
  let totalBits = 0;
  let totalTime = 0;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    try {
      const fd = new FormData();
      fd.append('file', blob, 'test.bin');
      await fetch(UPLOAD_URL, { method: 'POST', body: fd });
    } catch (_) {
      // Fallback: estimate upload as ~65% of download
      const est = downloadMbps * 0.65;
      animateValue(valUpload, 0, est, 'Mbps');
      setGauge(est, 200, 'Mbps');
      return est;
    }
    const t1 = performance.now();
    totalBits += chunkSize * 8;
    totalTime += (t1 - t0) / 1000;
  }
  const mbps = totalTime > 0 ? (totalBits / totalTime) / 1_000_000 : downloadMbps * 0.65;
  animateValue(valUpload, 0, mbps, 'Mbps');
  setGauge(mbps, 200, 'Mbps');
  return mbps;
}

// --- Fetch IP Info ---
async function fetchIPInfo() {
  try {
    const res = await fetch(IP_API_URL);
    const data = await res.json();
    ipAddr.textContent  = data.ip || '—';
    ispName.textContent = data.org || data.isp || '—';
    cityName.textContent = (data.city ? data.city + ', ' : '') + (data.country_name || '—');
    // Estimate connection type from download speed (set later via callback)
  } catch (_) {
    ipAddr.textContent = cityName.textContent = ispName.textContent = 'Tidak tersedia';
  }
}

function setConnectionType(mbps) {
  let type = '—';
  if (mbps >= 100) type = '🚀 Fiber / Gigabit';
  else if (mbps >= 30) type  = '⚡ Broadband Cepat';
  else if (mbps >= 10) type  = '📶 Broadband Normal';
  else if (mbps >= 1)  type  = '📡 4G / LTE';
  else                 type  = '🐌 Lambat / 3G';
  connectionType.textContent = type;
}

// --- Status helper ---
function setStatus(text, pct) {
  statusText.textContent = text;
  progressBar.style.width = pct + '%';
}

// --- Main Run ---
async function runSpeedTest() {
  if (isRunning) return;
  isRunning = true;

  // Reset UI
  btnStart.disabled = true;
  btnStart.textContent = '⏳ Sedang Mengukur...';
  resultPanel.classList.remove('show');
  valPing.textContent = '— ms';
  valDownload.textContent = '— Mbps';
  valUpload.textContent = '— Mbps';
  ipAddr.textContent = ispName.textContent = cityName.textContent = connectionType.textContent = '...';
  progressBar.style.width = '0%';
  progressBar.style.transition = 'none';
  await sleep(50);
  progressBar.style.transition = 'width 0.4s ease';

  try {
    // Fetch IP in parallel
    fetchIPInfo();

    // Sequential measurements
    await measurePing();
    await sleep(400);

    const dl = await measureDownload();
    await sleep(400);

    const ul = await measureUpload(dl);
    await sleep(400);

    setConnectionType(dl);
    setStatus('Selesai! ✅', 100);

    resultPanel.classList.add('show');
  } catch (err) {
    setStatus('Gagal. Coba lagi.', 0);
    console.error(err);
  } finally {
    btnStart.disabled = false;
    btnStart.textContent = '🔄 Tes Ulang';
    isRunning = false;
  }
}

btnStart.addEventListener('click', runSpeedTest);
