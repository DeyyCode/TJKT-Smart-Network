// ================================================
// TJKT Network Simulator — Simple Packet Tracer
// v2: + Data Packet Animation
// ================================================
(function () {
  const canvas = document.getElementById('net-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ---- State ----
  let devices    = [];
  let cables     = [];
  let packets    = [];
  let selectedId = null;
  let draggingId = null;
  let dragOffset = { x: 0, y: 0 };
  let isDragging = false;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let nextId     = 1;
  let animFrame  = null;
  let glowPulse  = 0;
  let lastTS     = 0;
  let testPassed = false;
  let sending    = false;

  const DEV_R = 34;

  const DEVICE_META = {
    pc:     { label: 'PC',     icon: '💻', color: '#a855f7' },
    router: { label: 'Router', icon: '📡', color: '#ec4899' },
  };

  const PKT_COLORS = ['#22c55e', '#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];

  // ---- Canvas sizing ----
  function resizeCanvas() {
    const wrap = canvas.parentElement;
    canvas.width  = wrap.clientWidth;
    canvas.height = Math.max(wrap.clientHeight, 340);
  }

  // ---- Main animation loop ----
  function startLoop() {
    cancelAnimationFrame(animFrame);
    function loop(ts) {
      const dt = Math.min((ts - lastTS) / 16.67, 3);
      lastTS = ts;
      glowPulse = (glowPulse + 0.05) % (Math.PI * 2);

      // Advance packets
      packets.forEach(p => {
        p.t += p.speed * dt;
        if (p.t >= 1) p.t = 0;
      });

      render();
      animFrame = requestAnimationFrame(loop);
    }
    animFrame = requestAnimationFrame(loop);
  }

  // ---- Rendering ----
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    cables.forEach(drawCable);
    packets.forEach(drawPacket);
    devices.forEach(drawDevice);
  }

  function drawGrid() {
    const step = 36;
    ctx.save();
    ctx.strokeStyle = 'rgba(168,85,247,0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(168,85,247,0.1)';
    for (let x = 0; x <= canvas.width; x += step) {
      for (let y = 0; y <= canvas.height; y += step) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Quadratic bezier point helper
  function bezierPt(t, ax, ay, bx, by) {
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2 + 28;
    return {
      x: (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx,
      y: (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by,
    };
  }

  function drawCable(cable) {
    const a = devices.find(d => d.id === cable.from);
    const b = devices.find(d => d.id === cable.to);
    if (!a || !b) return;

    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 + 28;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);

    if (cable.active) {
      const glow = 7 + 5 * Math.sin(glowPulse);
      ctx.strokeStyle = '#22c55e';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur  = glow;
      ctx.lineWidth   = 2.5;
    } else {
      ctx.strokeStyle = 'rgba(216,180,254,0.5)';
      ctx.lineWidth   = 2;
      ctx.setLineDash([8, 5]);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- Packet drawing with trail ----
  function drawPacket(p) {
    const a = devices.find(d => d.id === p.from);
    const b = devices.find(d => d.id === p.to);
    if (!a || !b) return;

    // Trail dots
    const TRAIL = 6;
    for (let i = TRAIL; i >= 1; i--) {
      const tt  = Math.max(0, p.t - i * 0.03);
      const tp  = bezierPt(tt, a.x, a.y, b.x, b.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, Math.max(0.5, 4 - i * 0.55), 0, Math.PI * 2);
      ctx.fillStyle   = p.color;
      ctx.globalAlpha = Math.max(0, 0.5 - i * 0.08);
      ctx.fill();
      ctx.restore();
    }

    // Main packet dot
    const pos = bezierPt(p.t, a.x, a.y, b.x, b.y);

    ctx.save();
    // Glow ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
    ctx.fillStyle   = p.color;
    ctx.globalAlpha = 0.15;
    ctx.fill();

    // Dot body
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 18;
    ctx.fill();

    // Inner white core
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();

    // "DATA" floating label (only on first packet per cable)
    if (p.showLabel) {
      ctx.save();
      ctx.font          = 'bold 8px Arial';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'bottom';
      ctx.fillStyle     = p.color;
      ctx.shadowColor   = p.color;
      ctx.shadowBlur    = 10;
      ctx.globalAlpha   = 0.9;
      ctx.fillText('DATA', pos.x, pos.y - 9);
      ctx.restore();
    }
  }

  function drawDevice(dev) {
    const meta  = DEVICE_META[dev.type];
    const isSel = dev.id === selectedId;
    const pulse = 4 + 4 * Math.sin(glowPulse);

    ctx.save();
    if (isSel) { ctx.shadowColor = meta.color; ctx.shadowBlur = pulse + 10; }

    // Body
    ctx.beginPath();
    ctx.arc(dev.x, dev.y, DEV_R, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(dev.x, dev.y - 8, 4, dev.x, dev.y, DEV_R);
    g.addColorStop(0, isSel ? 'rgba(168,85,247,0.55)' : 'rgba(80,20,140,0.6)');
    g.addColorStop(1, isSel ? 'rgba(80,20,140,0.6)'   : 'rgba(30,10,60,0.7)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = isSel ? '#f3e8ff' : meta.color;
    ctx.lineWidth   = isSel ? 2.5 : 1.8;
    ctx.shadowBlur  = 0;
    ctx.stroke();

    // Dashed selection ring
    if (isSel) {
      ctx.beginPath();
      ctx.arc(dev.x, dev.y, DEV_R + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(243,232,255,0.35)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Emoji icon
    ctx.shadowBlur = 0;
    ctx.font = '22px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(meta.icon, dev.x, dev.y - 4);

    // Label
    ctx.font = 'bold 10px Arial';
    ctx.fillStyle = '#f3e8ff';
    ctx.textBaseline = 'top';
    ctx.fillText(dev.label, dev.x, dev.y + DEV_R + 5);

    // Port indicator dot
    ctx.beginPath();
    ctx.arc(dev.x + DEV_R - 5, dev.y - DEV_R + 5, 4, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? '#f3e8ff' : meta.color;
    ctx.shadowColor = meta.color;
    ctx.shadowBlur  = isSel ? 8 : 0;
    ctx.fill();
    ctx.restore();
  }

  // ---- Hit test ----
  function getDeviceAt(x, y) {
    for (let i = devices.length - 1; i >= 0; i--) {
      if (Math.hypot(x - devices[i].x, y - devices[i].y) <= DEV_R + 6) return devices[i];
    }
    return null;
  }

  // ---- Interaction helpers ----
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function handleClick(id) {
    if (selectedId === null)      { selectedId = id; }
    else if (selectedId === id)   { selectedId = null; }
    else { connectDevices(selectedId, id); selectedId = null; }
  }

  // ---- Mouse events ----
  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    const { x, y } = canvasPos(e);
    mouseDownX = x; mouseDownY = y;
    const dev = getDeviceAt(x, y);
    draggingId = dev ? dev.id : null;
    isDragging = false;
    if (dev) dragOffset = { x: x - dev.x, y: y - dev.y };
  });

  canvas.addEventListener('mousemove', e => {
    if (draggingId === null) return;
    const { x, y } = canvasPos(e);
    if (Math.hypot(x - mouseDownX, y - mouseDownY) > 6) isDragging = true;
    if (isDragging) {
      const d = devices.find(d => d.id === draggingId);
      if (d) {
        d.x = clamp(x - dragOffset.x, DEV_R, canvas.width  - DEV_R);
        d.y = clamp(y - dragOffset.y, DEV_R, canvas.height - DEV_R - 18);
      }
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button !== 2 && !isDragging && draggingId !== null) handleClick(draggingId);
    isDragging = false;
    draggingId = null;
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const { x, y } = canvasPos(e);
    const d = getDeviceAt(x, y);
    if (d) deleteDevice(d.id);
  });

  canvas.addEventListener('click', e => {
    if (!getDeviceAt(...Object.values(canvasPos(e)))) selectedId = null;
  });

  // ---- Touch events ----
  function touchPos(e) {
    const t  = e.touches[0] || e.changedTouches[0];
    const r  = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const { x, y } = touchPos(e);
    mouseDownX = x; mouseDownY = y;
    const d = getDeviceAt(x, y);
    draggingId = d ? d.id : null;
    isDragging = false;
    if (d) dragOffset = { x: x - d.x, y: y - d.y };
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!draggingId) return;
    const { x, y } = touchPos(e);
    if (Math.hypot(x - mouseDownX, y - mouseDownY) > 6) isDragging = true;
    if (isDragging) {
      const d = devices.find(d => d.id === draggingId);
      if (d) {
        d.x = clamp(x - dragOffset.x, DEV_R, canvas.width  - DEV_R);
        d.y = clamp(y - dragOffset.y, DEV_R, canvas.height - DEV_R - 18);
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (!isDragging && draggingId) handleClick(draggingId);
    isDragging = false;
    draggingId = null;
  }, { passive: false });

  // ---- Add / Delete devices ----
  function addDevice(type) {
    const id = nextId++;
    const n  = devices.filter(d => d.type === type).length + 1;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const a  = Math.random() * Math.PI * 2;
    const r  = 80 + Math.random() * 80;
    devices.push({
      id, type,
      x: clamp(cx + Math.cos(a) * r, DEV_R + 10, canvas.width  - DEV_R - 10),
      y: clamp(cy + Math.sin(a) * r, DEV_R + 10, canvas.height - DEV_R - 30),
      label: `${DEVICE_META[type].label}-${n}`,
    });
  }

  function deleteDevice(id) {
    devices = devices.filter(d => d.id !== id);
    cables  = cables.filter(c => c.from !== id && c.to !== id);
    packets = packets.filter(p => p.from !== id && p.to !== id);
    if (selectedId === id) selectedId = null;
    if (testPassed) stopSending();
    showStatus('🗑️ Perangkat dihapus.', 'info');
  }

  // ---- Connect devices ----
  function connectDevices(a, b) {
    if (a === b) return;
    if (cables.some(c => (c.from === a && c.to === b) || (c.from === b && c.to === a))) {
      showStatus('⚠️ Sudah terhubung! Pilih perangkat lain.', 'warning');
      return;
    }
    cables.push({ from: a, to: b, active: false });
    if (testPassed) stopSending();
    showStatus('🔌 Kabel terpasang! Klik "Test Koneksi" untuk cek jaringan.', 'info');
  }

  // ---- Packet spawn ----
  function spawnPackets() {
    packets = [];
    const active = cables.filter(c => c.active);
    active.forEach((cable, i) => {
      // Forward packet
      packets.push({
        from: cable.from, to: cable.to,
        t: Math.random(),
        speed: 0.007 + Math.random() * 0.005,
        color: PKT_COLORS[i % PKT_COLORS.length],
        showLabel: i === 0,
      });
      // Return packet
      packets.push({
        from: cable.to, to: cable.from,
        t: Math.random(),
        speed: 0.006 + Math.random() * 0.005,
        color: PKT_COLORS[(i + 2) % PKT_COLORS.length],
        showLabel: false,
      });
    });
    sending = true;
    const sendBtn = document.getElementById('btn-send-data');
    if (sendBtn) sendBtn.classList.add('active');
  }

  function stopSending() {
    packets    = [];
    sending    = false;
    testPassed = false;
    cables.forEach(c => c.active = false);
    const sendBtn = document.getElementById('btn-send-data');
    if (sendBtn) sendBtn.classList.remove('active');
  }

  // ---- Connectivity test (BFS) ----
  function testConnectivity() {
    cables.forEach(c => c.active = false);
    packets = [];
    sending = false;
    testPassed = false;
    const sendBtn = document.getElementById('btn-send-data');
    if (sendBtn) sendBtn.classList.remove('active');

    if (devices.length < 2) { showStatus('❌ Tambahkan minimal 2 perangkat!', 'error'); return; }
    if (cables.length === 0) { showStatus('❌ Belum ada kabel yang terpasang!', 'error'); return; }

    // Build adjacency list
    const adj = {};
    devices.forEach(d => adj[d.id] = []);
    cables.forEach(c => { adj[c.from].push(c.to); adj[c.to].push(c.from); });

    // BFS
    const visited = new Set([devices[0].id]);
    const queue   = [devices[0].id];
    const parent  = {};
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj[cur]) {
        if (!visited.has(nb)) {
          visited.add(nb);
          parent[nb] = cur;
          queue.push(nb);
        }
      }
    }

    // Highlight spanning tree cables
    for (const [child, par] of Object.entries(parent)) {
      const c = cables.find(
        c => (c.from === +child && c.to === par) || (c.from === par && c.to === +child)
      );
      if (c) c.active = true;
    }

    const allOk = devices.every(d => visited.has(d.id));
    const pcs   = devices.filter(d => d.type === 'pc').length;
    const rts   = devices.filter(d => d.type === 'router').length;

    if (allOk) {
      testPassed = true;
      spawnPackets();
      showStatus(
        `✅ Jaringan terhubung sempurna! ${pcs} PC & ${rts} Router aktif. Data mengalir otomatis 📦`,
        'success'
      );
    } else {
      const lost = devices.filter(d => !visited.has(d.id)).map(d => d.label).join(', ');
      showStatus(`⚠️ ${lost} tidak terhubung ke jaringan! Periksa kabelnya.`, 'warning');
    }
  }

  // ---- Kirim Data ----
  function kirimData() {
    if (!testPassed) {
      showStatus('❌ Test koneksi dulu sebelum mengirim data!', 'error');
      return;
    }
    if (sending) {
      // Stop
      packets = [];
      sending = false;
      const sendBtn = document.getElementById('btn-send-data');
      if (sendBtn) { sendBtn.classList.remove('active'); sendBtn.textContent = '📦 Kirim Data'; }
      showStatus('⏹️ Pengiriman data dihentikan.', 'info');
    } else {
      // Start
      spawnPackets();
      const sendBtn = document.getElementById('btn-send-data');
      if (sendBtn) sendBtn.textContent = '⏹️ Stop Data';
      showStatus('📦 Mengirim data! Paket bergerak di kabel. Klik lagi untuk stop.', 'info');
    }
  }

  // ---- Status ----
  function showStatus(msg, type) {
    const el = document.getElementById('netgame-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'netgame-status show ' + type;
  }

  // ---- Button bindings ----
  document.getElementById('btn-test-net')?.addEventListener('click', testConnectivity);
  document.getElementById('btn-send-data')?.addEventListener('click', kirimData);
  document.getElementById('btn-reset-net')?.addEventListener('click', () => {
    devices = []; cables = []; packets = [];
    selectedId = null; draggingId = null; nextId = 1;
    testPassed = false; sending = false;
    const sendBtn = document.getElementById('btn-send-data');
    if (sendBtn) { sendBtn.classList.remove('active'); sendBtn.textContent = '📦 Kirim Data'; }
    const el = document.getElementById('netgame-status');
    if (el) { el.className = 'netgame-status'; el.textContent = ''; }
    showStatus('💡 Canvas direset. Tambah perangkat dari toolbar!', 'info');
  });

  document.querySelectorAll('.tool-device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addDevice(btn.dataset.type);
      showStatus(
        `💡 ${DEVICE_META[btn.dataset.type].label} ditambahkan! Klik untuk pilih, klik perangkat lain untuk sambungkan.`,
        'info'
      );
    });
  });

  // ---- Init ----
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  startLoop();

  setTimeout(() => {
    addDevice('router');
    addDevice('pc');
    addDevice('pc');
    showStatus('💡 Demo siap! Klik device untuk pilih → klik lain untuk sambung kabel. Klik kanan hapus.', 'info');
  }, 200);
})();
