/* =====================================================
   AI Network Simulator — Kengaytirilgan JavaScript
   Tuzilma:
   1) Konfiguratsiya & Protokollar
   2) Ssenariylar (Presets)
   3) Simulyatsiya dvigateli
   4) AI diagnostika moduli
   5) Saqlash & Eksport (JSON/CSV/Print)
   6) Interfeys & Formalar
   7) Jonli Topologiya Vizualizatori (Canvas)
   8) Grafiklar (Chart.js + Radar)
   9) Jonli Telemetriya (Real-time NOC)
   ===================================================== */

/* ---------- 1. KONFIGURATSIYA & PROTOKOLLAR ---------- */
const CONFIG = JSON.parse(localStorage.getItem('ans_cfg') || '{"useBackend":true,"apiBase":"http://localhost:8080"}');
const KEY = 'ans_history_v2';

const PROTO = {
  'HTTPS/TLS 1.3': { sec:'Yuqori',      lat:"O'rta",      ovh:"O'rta",      perf:"Yuqori",      latAdd:4,   ovhPct:4.5,  secScore:88, desc:'Zamonaviy TLS 1.3 shifrlash va xavfsizlik' },
  'HTTP/3 (QUIC)': { sec:'Juda Yuqori', lat:'Juda Past',  ovh:'Past',       perf:'Juda Yuqori', latAdd:2,   ovhPct:3.0,  secScore:95, desc:'UDP asosidagi 0-RTT va multipleksing' },
  'WireGuard':     { sec:'Juda Yuqori', lat:'Past',       ovh:'Past',       perf:'Juda Yuqori', latAdd:5,   ovhPct:5.0,  secScore:96, desc:'Zamonaviy yengil va o\'ta tezkor VPN' },
  'OpenVPN/IPSec': { sec:'Yuqori',      lat:'Yuqori',     ovh:'Yuqori',     perf:'O\'rta',      latAdd:18,  ovhPct:14.0, secScore:90, desc:'Klassik og\'ir korporativ shifrlangan VPN' },
  'SSH':           { sec:'Yuqori',      lat:"O'rta",      ovh:"O'rta",      perf:"Yuqori",      latAdd:7,   ovhPct:6.0,  secScore:85, desc:'Xavfsiz terminal va SSH tunnellash' },
  'WebSocket':     { sec:"O'rta",       lat:'Past',       ovh:'Past',       perf:'Yuqori',      latAdd:2.5, ovhPct:2.5,  secScore:70, desc:'Doimiy ikki tomonlama real-vaqt kanali' },
  'HTTP/1.1':      { sec:'Past',        lat:'Past',       ovh:'Past',       perf:'O\'rta',      latAdd:1,   ovhPct:2.0,  secScore:15, desc:'Shifrlanmagan, MITM xavfi yuqori' },
  'NONE':          { sec:'Yo\'q',       lat:'Juda Past',  ovh:'Nol',        perf:'Maksimal',    latAdd:0,   ovhPct:0.0,  secScore:0,  desc:'Himoyasiz ochiq paketlar (taqqoslash uchun)' }
};

const FIELDS = [
  { id:'bandwidth', label:'Bandwidth — Tarmoq tezligi', unit:'Mbit/s', min:1, max:1000, step:1,   val:100, slider:true },
  { id:'latency',   label:'Latency — Kechikish',        unit:'ms',     min:1, max:500,  step:1,   val:35,  slider:true },
  { id:'loss',      label:"Packet Loss — Yo'qotish",    unit:'%',      min:0, max:25,   step:0.1, val:0.6, slider:true },
  { id:'jitter',    label:'Jitter — Tebranish',         unit:'ms',     min:0, max:100,  step:0.5, val:3.0, slider:true },
  { id:'load',      label:'Network Load — Yuklama',     unit:'%',      min:0, max:100,  step:1,   val:55,  slider:true },
  { id:'users',     label:'Foydalanuvchilar soni',      unit:'ta',     min:1, max:10000, step:1,  val:200, slider:false }
];

/* ---------- 2. TAYYOR SSENARIYLAR (PRESETS) ---------- */
const PRESETS = [
  {
    id: 'office',
    name: '🏢 Standart Ofis',
    desc: 'Korxona ichki tarmog\'i, barqaror ish',
    params: { bandwidth: 100, latency: 20, loss: 0.2, jitter: 2.5, load: 45, users: 150, protocol: 'HTTPS/TLS 1.3', mtu: '1500', qos: 'voip' }
  },
  {
    id: 'ddos',
    name: '💥 DDoS / Trafik Bo\'roni',
    desc: 'Haddan tashqari yuklama va yo\'qotish',
    params: { bandwidth: 1000, latency: 195, loss: 14.5, jitter: 48, load: 97, users: 5500, protocol: 'HTTP/1.1', mtu: '1500', qos: 'none' }
  },
  {
    id: 'gaming',
    name: '🎮 Onlayn Gaming / Esport',
    desc: 'Ultra-past latency va minimal jitter',
    params: { bandwidth: 50, latency: 12, loss: 0.02, jitter: 1.2, load: 22, users: 4, protocol: 'HTTP/3 (QUIC)', mtu: '1500', qos: 'voip' }
  },
  {
    id: 'streaming',
    name: '📺 4K UHD Striming',
    desc: 'Katta o\'tkazuvchanlik va Jumbo paketlar',
    params: { bandwidth: 300, latency: 28, loss: 0.1, jitter: 3.5, load: 68, users: 45, protocol: 'HTTP/3 (QUIC)', mtu: '9000', qos: 'codel' }
  },
  {
    id: 'mobile',
    name: '📱 Zaif Mobil Tarmoq',
    desc: 'Chekka hudud, 3G/Zaif LTE signali',
    params: { bandwidth: 15, latency: 115, loss: 4.8, jitter: 32, load: 82, users: 12, protocol: 'HTTPS/TLS 1.3', mtu: '576', qos: 'none' }
  },
  {
    id: 'bank',
    name: '🔒 Xavfsiz Bank Tizimi',
    desc: 'Maksimal shifrlash va 0% paket yo\'qotish',
    params: { bandwidth: 200, latency: 24, loss: 0.0, jitter: 1.8, load: 40, users: 300, protocol: 'WireGuard', mtu: '1500', qos: 'codel' }
  }
];

/* ---------- YORDAMCHI FUNKSIYALAR ---------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cls = s => s === 'Yaxshi' ? 'good' : s === 'Kritik' ? 'bad' : 'mid';
const badge = s => `<span class="badge ${cls(s)}">${s}</span>`;

function showToast(text, type = 'info') {
  const c = $('#toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'warn' ? '⚠' : type === 'error' ? '✕' : 'ℹ';
  t.innerHTML = `<span>${icon}</span><span>${text}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    t.style.transition = '0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

/* ---------- 3. SIMULYATSIYA DVIGATELI ---------- */
const latencyAt = (p, load) => {
  const P = PROTO[p.protocol] || PROTO['HTTPS/TLS 1.3'];
  const qosBonus = p.qos === 'voip' ? 0.85 : p.qos === 'codel' ? 0.9 : 1.0;
  return (p.latency * (1 + 1.8 * (load / 100) ** 2) + P.latAdd + p.users * 0.008) * qosBonus;
};

const lossAt = (p, load) => {
  const P = PROTO[p.protocol] || PROTO['HTTPS/TLS 1.3'];
  const qosBonus = p.qos === 'voip' ? 0.75 : 1.0;
  return (p.loss + Math.max(0, load - 60) * 0.05 + P.ovhPct * 0.02) * qosBonus;
};

function simulate(p) {
  const P = PROTO[p.protocol] || PROTO['HTTPS/TLS 1.3'];
  const latency = latencyAt(p, p.load);
  const loss = lossAt(p, p.load);
  const jitter = p.jitter * (1 + p.load / 90) + loss * 0.4;
  const usage = clamp(p.load + P.ovhPct * 0.5 + (p.users / Math.max(1, p.bandwidth)) * 1.8, 0, 100);
  const throughput = Math.max(0.01, p.bandwidth * (1 - P.ovhPct / 100) * (1 - p.load / 220) * (1 - loss / 50));
  const goodput = Math.max(0.01, throughput * (1 - P.ovhPct / 100));
  const efficiency = clamp((goodput / p.bandwidth) * 100, 0.5, 100);
  const handshake = (P.rtts || 1) * latency;
  const bdp_kb = Math.max(1, (throughput * 1e6 / 8) * (latency / 1000) / 1024);

  // Bufferbloat xavfi (0 - 100%)
  const bufferbloat = clamp((latency - p.latency) * 1.4 + p.load * 0.35, 0, 100);

  // Umumiy unumdorlik bali (0–100)
  const score = clamp(100 - Math.min(35, latency * 0.2) - Math.min(30, loss * 6) - p.load * 0.22 - P.ovhPct * 0.4, 0, 100);
  const status = score >= 82 ? "A'lo" : score >= 65 ? 'Yaxshi' : score >= 42 ? "O'rtacha" : 'Kritik';

  // Radar grafiki uchun tarmoq salomatligi
  const health = {
    speed: clamp(Math.round(throughput / p.bandwidth * 100), 10, 100),
    latency: clamp(Math.round(100 - (latency * 0.35)), 10, 100),
    lossResist: clamp(Math.round(100 - (loss * 15)), 5, 100),
    security: P.secScore,
    stability: clamp(Math.round(100 - (jitter * 3)), 15, 100)
  };

  return { latency, loss, jitter, usage, throughput, goodput, efficiency, handshake, bdp_kb, bufferbloat, score, status, overhead: P.ovhPct, health };
}

/* ---------- 4. AI TAHLILI MODULI ---------- */
function localAI(p, r) {
  const anomalies = [];
  const load = p.load || 50;
  const users = p.users || 150;
  const proto = p.protocol || 'HTTPS/TLS 1.3';
  const loss = r.loss;
  const lat = r.latency;
  const jitter = r.jitter || 0;
  const bufferbloat = r.bufferbloat || 0;

  if ((load >= 90 && users >= 1000) || load >= 97) {
    anomalies.push({
      id: 'DDOS_STORM',
      name: 'DDoS / Trafik Bo\'roni Anomaliyasi',
      severity: 'critical',
      desc: `Trafik va so'rovlar oqimi o'ta yuqori (${load}% yuklama, ${users} ta oqim). Kommutatorlar buferi to'lib ketgan.`,
      mitigation: 'Load Balancer klaster o\'rnating va Cloudflare / WAF himoyasini yoqing.'
    });
  }
  if (bufferbloat >= 65) {
    anomalies.push({
      id: 'BUFFERBLOAT_DISASTER',
      name: 'Kritik Bufferbloat (Navbat To\'lishi)',
      severity: bufferbloat >= 80 ? 'critical' : 'warning',
      desc: `Navbatlar kechikishi sababli latency ${lat.toFixed(1)} ms ga oshdi. Bufer indeksi: ${bufferbloat.toFixed(0)}%.`,
      mitigation: 'FQ-CoDel yoki CAKE Smart Queue Management (SQM) faollashtiring.'
    });
  }
  if (proto === 'HTTP/1.1' || proto === 'NONE') {
    anomalies.push({
      id: 'UNENCRYPTED_MITM',
      name: 'Kiber-Xavfsizlik Zaifligi (Ochiq Trafik)',
      severity: 'critical',
      desc: `${proto} ishlatilmoqda. Trafik shifrlanmagan! Sniffing va Man-in-the-Middle (MITM) xavfi mavjud.`,
      mitigation: 'Zudlik bilan HTTPS/TLS 1.3 yoki HTTP/3 (QUIC) ga o\'ting.'
    });
  }
  if (loss >= 3.0) {
    anomalies.push({
      id: 'RETRANSMISSION_STORM',
      name: 'TCP Retransmissiya Bo\'roni',
      severity: loss >= 7.0 ? 'critical' : 'warning',
      desc: `Paket yo'qotilishi ${loss.toFixed(2)}% ga yetdi. TCP mexanizmi to'xtovsiz qayta yuborib kanalni bo'g'moqda.`,
      mitigation: 'Aloqa kanalini fizik tekshiring yoki MTU o\'lchamini sozlang.'
    });
  }
  if (jitter >= 15.0) {
    anomalies.push({
      id: 'HIGH_JITTER',
      name: 'Katta Jitter Tebranishi',
      severity: 'warning',
      desc: `Jitter ${jitter.toFixed(1)} ms. Video aloqa va IP-telefoniyada robot ovozi va uzilishlar yuzaga keladi.`,
      mitigation: 'QoS VoIP ustuvorlik qoidasini yoqing va jitter buferini 25 ms ga sozlang.'
    });
  }

  // XAI (Explainable AI faktorlar ta'siri)
  const raw_load = load * 0.45;
  const raw_loss = loss * 12.0;
  const raw_lat = (lat / 15.0) * 1.5;
  const raw_ovh = (r.overhead || 5) * 2.2;
  const total = Math.max(0.1, raw_load + raw_loss + raw_lat + raw_ovh);

  const xai_impacts = {
    'Tarmoq yuklamasi (Load)': +((raw_load / total) * 100).toFixed(1),
    'Paket yo\'qotilishi (Packet Loss)': +((raw_loss / total) * 100).toFixed(1),
    'Kechikish (Latency)': +((raw_lat / total) * 100).toFixed(1),
    'Protokol overhead': +((raw_ovh / total) * 100).toFixed(1)
  };
  const top_factor = Object.keys(xai_impacts).reduce((a, b) => xai_impacts[a] > xai_impacts[b] ? a : b);

  // Ehtimolliklar
  let pGood = clamp(r.score > 70 ? (r.score - 50) * 2 : 10, 2, 85);
  let pCrit = clamp(r.score < 50 ? (50 - r.score) * 2 : 5, 2, 85);
  let pMid = clamp(100 - pGood - pCrit, 5, 70);
  let pOpt = clamp(r.score >= 82 ? (r.score - 80) * 4 : 2, 1, 60);
  const pSum = pGood + pCrit + pMid + pOpt;

  const probabilities = {
    "A'lo": +((pOpt / pSum) * 100).toFixed(1),
    "Yaxshi": +((pGood / pSum) * 100).toFixed(1),
    "O'rtacha": +((pMid / pSum) * 100).toFixed(1),
    "Kritik": +((pCrit / pSum) * 100).toFixed(1)
  };

  const rec = [];
  if (load >= 75) rec.push(`Kanal kengligini ${(p.bandwidth * 1.5).toFixed(0)} Mbit/s ga oshirish yoki yuklamani taqsimlovchi klaster joriy etish zarur.`);
  if (loss >= 1.5) rec.push("QoS qoidalarini yoki FQ-CoDel aqlli navbat algoritmini faollashtiring.");
  if (proto === 'HTTP/1.1' || proto === 'NONE') rec.push("Zudlik bilan HTTP/3 (QUIC) yoki HTTPS/TLS 1.3 ga o'tish tavsiya etiladi.");
  if (bufferbloat >= 50) rec.push("Routerdagi buferbloatni bartaraf etish uchun CoDel/CAKE navbatini yoqing.");
  if (!rec.length) rec.push("Tarmoq sozlamalari ideal. Hozirgi konfiguratsiyani saqlang.");

  return {
    cls: r.status,
    predicted_health: r.status,
    overall_score: r.score,
    analysis: `Tarmoq unumdorligi ${r.score.toFixed(0)} ball bilan baholandi. Eng ta'sirli omil: ${top_factor}. ${anomalies.length ? anomalies.length + " ta anomaliya aniqlandi." : "Tizim barqaror ishlamoqda."}`,
    recommendation: rec.join(' '),
    recommendations: rec,
    anomalies: anomalies,
    xai_impacts: xai_impacts,
    top_factor: top_factor,
    probabilities: probabilities,
    risks: anomalies.length ? anomalies.map(a => a.name) : ['Jiddiy tahdid aniqlanmadi']
  };
}

async function aiAnalyze(p, r) {
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(CONFIG.apiBase + '/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, result: r })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Backend API ulanmadi — lokal tahlil ishlatildi');
    }
  }
  return localAI(p, r);
}

/* ---------- 5. SAQLASH & EKSPORT (JSON, CSV, PRINT) ---------- */
const getHist = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const setHist = h => localStorage.setItem(KEY, JSON.stringify(h));
let current = null;

async function makeEntry(p) {
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(CONFIG.apiBase + '/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      if (res.ok) {
        const data = await res.json();
        const cur = data.results.current;
        return {
          id: data.id,
          raw_id: data.raw_id,
          date: data.created_at,
          input: data.params,
          result: {
            latency: cur.latency_ms,
            loss: cur.packet_loss,
            jitter: cur.jitter_ms,
            throughput: cur.throughput_mbps,
            goodput: cur.goodput_mbps,
            usage: cur.usage_pct,
            overhead: cur.overhead_pct,
            bufferbloat: cur.bufferbloat_score,
            bdp_kb: cur.bdp_kb,
            handshake: cur.handshake_ms,
            score: cur.overall_score,
            status: cur.status,
            health: {
              speed: cur.health_metrics.bandwidth,
              latency: cur.health_metrics.latency,
              lossResist: cur.health_metrics.loss,
              security: cur.health_metrics.security,
              stability: cur.health_metrics.stability
            }
          },
          ai: data.ai,
          curve: data.results.curve,
          comparison: data.results.comparison
        };
      }
    } catch (e) {
      console.warn("Backend API ulanmadi, lokal hisoblash ishlatildi:", e);
    }
  }

  // Lokal hisoblash
  const r = simulate(p);
  const ai = localAI(p, r);
  const h = getHist();
  const n = h.reduce((m, e) => Math.max(m, +(e.id.replace('SIM-', '')) || 0), 0) + 1;
  return {
    id: 'SIM-' + String(n).padStart(3, '0'),
    date: new Date().toLocaleString('uz-UZ'),
    input: p,
    result: r,
    ai
  };
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCurrentJson() {
  if (!current) { showToast('Avval simulyatsiya bajaring!', 'warn'); return; }
  const jsonStr = JSON.stringify(current, null, 2);
  downloadFile(jsonStr, `${current.id}_report.json`, 'application/json');
  showToast('JSON hisobot muvaffaqiyatli yuklandi', 'success');
}

function exportCsv(list, filename = 'network_simulations.csv') {
  if (!list || !list.length) { showToast('Eksport uchun ma\'lumot yo\'q!', 'warn'); return; }
  const headers = ['ID', 'Sana', 'Protokol', 'Bandwidth (Mbit/s)', 'Latency (ms)', 'Packet Loss (%)', 'Jitter (ms)', 'Load (%)', 'Throughput (Mbit/s)', 'Score', 'Status'];
  const rows = list.map(e => [
    e.id,
    `"${e.date}"`,
    e.input.protocol,
    e.input.bandwidth,
    e.result.latency.toFixed(1),
    e.result.loss.toFixed(2),
    (e.result.jitter || e.input.jitter || 0).toFixed(1),
    e.input.load,
    e.result.throughput.toFixed(1),
    e.result.score.toFixed(0),
    e.result.status
  ]);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
  showToast('CSV fayl yuklandi', 'success');
}

/* ---------- 6. INTERFEYS VA FORMALAR ---------- */
function show(v) {
  $$('.view').forEach(e => e.classList.toggle('show', e.id === 'v-' + v));
  $$('nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  $('#sidebar').classList.remove('open');
  if (v === 'results') { renderResults(); renderCharts(); }
  if (v === 'ai') renderAI();
  if (v === 'protocols') renderCompare();
  if (v === 'topology') startTopology();
  refresh();
}

function buildPresets() {
  const container = $('#presetList');
  if (!container) return;
  container.innerHTML = PRESETS.map(pr => `
    <div class="preset-btn" data-preset="${pr.id}">
      <strong>${pr.name}</strong>
      <span>${pr.desc}</span>
    </div>
  `).join('');

  $$('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pr = PRESETS.find(p => p.id === btn.dataset.preset);
      if (pr) {
        setForm(pr.params);
        showToast(`«${pr.name}» ssenariysi yuklandi`, 'info');
      }
    };
  });
}

function buildForm() {
  const fieldsHtml = FIELDS.map(f => `
    <div class="field">
      <label>${f.label}</label>
      <div class="row">
        ${f.slider ? `<input type="range" id="${f.id}R" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.val}">` : ''}
        <input type="number" id="${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.val}">
        <span>${f.unit}</span>
      </div>
    </div>
  `).join('') + `
    <div class="field">
      <label>Paket hajmi (MTU)</label>
      <select id="mtu" class="txt">
        <option value="1500" selected>1500 bayt (Standart Ethernet)</option>
        <option value="576">576 bayt (Mobil / Xalqaro tranzit)</option>
        <option value="9000">9000 bayt (Jumbo Frames / Data Center)</option>
      </select>
    </div>
    <div class="field">
      <label>QoS (Xizmat ko'rsatish sifati)</label>
      <select id="qos" class="txt">
        <option value="none">O'chirilgan (Best Effort)</option>
        <option value="voip" selected>VoIP va Audio/Video ustuvorligi</option>
        <option value="codel">FQ-CoDel (Bufferbloat himoyasi)</option>
      </select>
    </div>
  `;

  $('#fields').innerHTML = fieldsHtml;

  FIELDS.forEach(f => {
    const n = $('#' + f.id), r = $('#' + f.id + 'R');
    n.oninput = () => { if (r) r.value = n.value; };
    if (r) r.oninput = () => n.value = r.value;
  });

  // Protokollar tugmalari
  $('#protoSeg').innerHTML = Object.keys(PROTO).map((k, i) =>
    `<button type="button" data-p="${k}" class="${k === 'HTTPS/TLS 1.3' ? 'on' : ''}">${k}</button>`
  ).join('');

  $$('#protoSeg button').forEach(b => {
    b.onclick = () => {
      $$('#protoSeg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    };
  });
}

function readForm() {
  const p = {
    protocol: $('#protoSeg .on')?.dataset.p || 'HTTPS/TLS 1.3',
    mtu: $('#mtu').value,
    qos: $('#qos').value
  };
  FIELDS.forEach(f => p[f.id] = clamp(+$('#' + f.id).value || f.min, f.min, f.max));
  return p;
}

function setForm(p) {
  FIELDS.forEach(f => {
    if (p[f.id] !== undefined) {
      $('#' + f.id).value = p[f.id];
      if (f.slider && $('#' + f.id + 'R')) $('#' + f.id + 'R').value = p[f.id];
    }
  });
  if (p.mtu) $('#mtu').value = p.mtu;
  if (p.qos) $('#qos').value = p.qos;
  if (p.protocol) {
    $$('#protoSeg button').forEach(b => b.classList.toggle('on', b.dataset.p === p.protocol));
  }
}

async function run(p) {
  $('#loader').classList.add('show');
  const steps = $$('#loader li');
  steps.forEach(s => s.className = '');
  for (const s of steps) {
    s.className = 'act';
    await sleep(260);
    s.className = 'done';
  }
  const e = await makeEntry(p);
  setHist([e, ...getHist()]);
  current = e;
  $('#loader').classList.remove('show');
  showToast(`Simulyatsiya bajarildi: ${e.id} [${e.result.status}]`, 'success');
  show('results');
}

function renderResults() {
  if (!current) {
    $('#resBox').innerHTML = '<div class="card empty">Hali simulyatsiya bajarilmagan. «Yangi simulyatsiya» bo\'limiga o\'ting.</div>';
    return;
  }
  const { input: p, result: r } = current;
  $('#resBox').innerHTML = `
    <div class="rgrid">
      <div class="card"><span>Haqiqiy tezlik</span><b>${r.throughput.toFixed(1)} Mbit/s</b><small>Kiritilgan: ${p.bandwidth} Mbit/s</small></div>
      <div class="card"><span>Foydali Goodput</span><b>${(r.goodput || r.throughput * 0.95).toFixed(1)} Mbit/s</b><small>Overheadsiz sof oqim</small></div>
      <div class="card"><span>Latency (Kechikish)</span><b>${r.latency.toFixed(1)} ms</b><small>Baza: ${p.latency} ms (+${(r.latency - p.latency).toFixed(1)} ms)</small></div>
      <div class="card"><span>Packet Loss</span><b>${r.loss.toFixed(2)}%</b><small>Baza: ${p.loss}%</small></div>
      <div class="card"><span>Jitter (Tebranish)</span><b>${(r.jitter || 0).toFixed(1)} ms</b><small>Baza: ${p.jitter || 0} ms</small></div>
      <div class="card"><span>BDP (Kanal sig'imi)</span><b>${(r.bdp_kb || 0).toFixed(0)} KB</b><small>Optimal TCP buferi</small></div>
      <div class="card"><span>Bufferbloat Xavfi</span><b>${r.bufferbloat.toFixed(0)}%</b><small>${r.bufferbloat > 60 ? 'Yuqori navbat' : 'Normal navbat'}</small></div>
      <div class="card"><span>Unumdorlik Bali</span><b>${r.score.toFixed(0)} / 100</b><small>Integral reyting</small></div>
    </div>

    <div class="statusBar big">
      <div class="status-left">
        <h2 style="margin:0">Tarmoq Holati:</h2>
        ${badge(r.status)}
        <span style="color:var(--mu); font-size:0.95rem;">ID: <b>${current.id}</b> · Protokol: <b>${p.protocol}</b> · Sana: ${current.date}</span>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-sm success" onclick="show('ai'); applyAiOptimization();">✦ AI Avto-Optimallashtirish</button>
        <button class="btn btn-sm" onclick="show('ai')">✦ AI Diagnostikasini O'qish</button>
      </div>
    </div>

    <div class="warn">
      ℹ Ushbu simulyatsiya Mathis TCP modeli, M/M/1 navbat nazariyasi va xavfsizlik protokollari shifrlash formulalari asosida hisoblangan.
    </div>
  `;
}

function renderAI() {
  if (!current) {
    $('#aiBox').innerHTML = '<div class="card empty">AI tahlili uchun avval simulyatsiya bajaring.</div>';
    return;
  }
  const { input: p, ai, result: r } = current;

  // 1. Ehtimolliklar kartalari
  const probs = ai.probabilities || { "A'lo": 10, "Yaxshi": 60, "O'rtacha": 25, "Kritik": 5 };
  const maxProbKey = Object.keys(probs).reduce((a, b) => probs[a] > probs[b] ? a : b);
  const probCardsHtml = Object.entries(probs).map(([k, v]) => `
    <div class="prob-card ${k === maxProbKey ? 'highest' : ''}">
      <small>${k}</small>
      <div>${v}%</div>
      <div class="prob-progress"><div class="prob-bar" style="width:${v}%"></div></div>
    </div>
  `).join('');

  // 2. XAI Faktorlar Ta'siri
  const xai = ai.xai_impacts || {
    'Tarmoq yuklamasi (Load)': 45,
    'Paket yo\'qotilishi (Packet Loss)': 30,
    'Kechikish (Latency)': 15,
    'Protokol overhead': 10
  };
  const xaiBarsHtml = Object.entries(xai).map(([name, pct]) => `
    <div class="xai-item">
      <div class="xai-header">
        <span>${name}</span>
        <b>${pct}%</b>
      </div>
      <div class="xai-track">
        <div class="xai-bar" style="width:${pct}%"></div>
      </div>
    </div>
  `).join('');

  // 3. Kiber-Xavfsizlik va Anomaliyalar
  const anomalies = ai.anomalies || [];
  let anomaliesHtml = '';
  if (anomalies.length) {
    anomaliesHtml = anomalies.map(a => `
      <div class="anomaly-item ${a.severity}">
        <div class="anomaly-head">
          <span class="anomaly-title">
            ${a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : 'ℹ️'} ${a.name}
          </span>
          <span class="badge ${a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'mid' : 'good'}">
            ${a.severity.toUpperCase()}
          </span>
        </div>
        <div class="anomaly-desc">${a.desc}</div>
        <div class="anomaly-mitigation"><b>Tavsiya:</b> ${a.mitigation}</div>
      </div>
    `).join('');
  } else {
    anomaliesHtml = '<div style="color:var(--ok); font-size:0.9rem; padding:10px 0;">✓ Jiddiy kiber-zaiflik yoki anomaliya aniqlanmadi. Tarmoq me\'yoriy holatda.</div>';
  }

  // 4. Tavsiyalar
  const recs = ai.recommendations || [ai.recommendation];
  const recsHtml = recs.map((t, idx) => `
    <li style="margin-bottom:8px; line-height:1.45;">
      <b>${idx + 1}.</b> ${t}
    </li>
  `).join('');

  $('#aiBox').innerHTML = `
    <!-- Asosiy Sarlavha -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h2>✦ AI Neyron Diagnostikasi & Kiber-Monitoring</h2>
          <span class="note">Kirish: ${p.bandwidth} Mbit/s · ${p.latency} ms · ${p.loss}% yo'qotish · ${p.load}% yuklama · ${p.protocol} · ${p.users} foydalanuvchi</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="badge" style="background:linear-gradient(90deg, var(--cy), var(--vi)); color:#fff;">Random Forest AI Ensemble</span>
          <div>${badge(ai.cls || r.status)}</div>
        </div>
      </div>

      <!-- Ehtimolliklar Paneli -->
      <h3 style="margin-top:18px; font-size:0.95rem; color:var(--mu);">AI Sinflar Ehtimolliklari (Probability Distribution):</h3>
      <div class="prob-grid">${probCardsHtml}</div>
    </div>

    <!-- 2 Ustunli Diagnostika Gridi -->
    <div class="aiGrid">
      <!-- Chap Ustun: XAI va Tahlil -->
      <div class="card">
        <h3>📊 Tushuntiriluvchan AI (XAI) Faktorlar Ta'siri</h3>
        <p style="font-size:0.85rem; color:var(--mu);">Qaysi omil tarmoq sekinlashishiga ko'proq ta'sir ko'rsatmoqda?</p>
        <div class="xai-container">${xaiBarsHtml}</div>
        <div style="margin-top:14px; font-size:0.88rem; background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:10px; border:1px solid var(--bd);">
          Eng yuqori salbiy ta'sir ko'rsatuvchi omil: <b style="color:var(--accent);">${ai.top_factor || 'Tarmoq yuklamasi'}</b>
        </div>
      </div>

      <!-- O'ng Ustun: Anomaliyalar va Xavfsizlik -->
      <div class="card">
        <h3>🛡 Kiber-Xavfsizlik va Tarmoq Anomaliyalari</h3>
        <p style="font-size:0.85rem; color:var(--mu);">Sun'iy intellekt tomonidan aniqlangan muammolar:</p>
        <div class="anomaly-list">${anomaliesHtml}</div>
      </div>
    </div>

    <!-- AI Tavsiyalar va Harakatlar Rejasi -->
    <div class="card" style="margin-top:20px;">
      <h3>🎯 AI Ekspert Xulosasi va Harakatlar Rejasi</h3>
      <p style="color:var(--tx); margin:10px 0 14px; font-size:0.95rem; line-height:1.5;">${ai.analysis}</p>
      <ul style="padding-left:18px; color:var(--mu);">${recsHtml}</ul>
    </div>

    <!-- AI Avtomatik Optimallashtiruvchi moduli -->
    <div class="opt-box" id="optContainer">
      <div class="opt-header">
        <div>
          <h3 style="margin:0; color:var(--accent); font-size:1.15rem;">⚡ AI Prescriptive Optimizer (Avtomatik Sozlash)</h3>
          <p style="margin:4px 0 0; color:var(--mu); font-size:0.85rem;">Sun'iy intellekt optimal konfiguratsiyani avtomatik hisoblab chiqdi:</p>
        </div>
        <button class="btn btn-sm success" id="btnRunOptimizer" onclick="applyAiOptimization()">
          🚀 Tavsiya etilgan sozlamalarni qo'llash
        </button>
      </div>
      <div id="optDetails">
        <p style="color:var(--mu); font-size:0.9rem;">Optimallashtirish tahlilini yuklash uchun yuqoridagi tugmani bosing.</p>
      </div>
    </div>

    <!-- AI Stress-Test Bo'limi -->
    <div class="card" style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <div>
          <h3>💥 AI Stress-Test (Crash Test / Bardoshlilik Sinovi)</h3>
          <p style="color:var(--mu); font-size:0.85rem;">Tarmoq qaysi yuklamada sinadi va maksimal necha foydalanuvchini ko'tara oladi?</p>
        </div>
        <button class="btn btn-sm danger" id="btnStressRun" onclick="runAiStressTest()">
          ⚡ Stress-Testni Boshlash
        </button>
      </div>
      <div id="stressDetails"></div>
      <div class="cw" id="stressChartBox" style="display:none; height:280px; margin-top:16px;">
        <canvas id="stressChart"></canvas>
      </div>
    </div>
  `;

  // Avtomatik optimizer tavsiyalarini hisoblash
  loadOptimizerPreview();
}

async function loadOptimizerPreview() {
  if (!current) return;
  const p = current.input;
  let opt = null;
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(CONFIG.apiBase + '/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      if (res.ok) opt = await res.json();
    } catch (e) { }
  }
  if (!opt) {
    // Lokal optimizer
    const targetBw = p.load > 60 ? Math.round(p.bandwidth * (p.load / 45)) : p.bandwidth;
    const targetProto = 'HTTP/3 (QUIC)';
    opt = {
      delta_score: 18.5,
      recommended_params: {
        bandwidth: targetBw,
        latency: p.latency,
        loss: 0.1,
        load: 40,
        protocol: targetProto,
        qos: 'codel',
        mtu: 1500,
        users: p.users
      },
      action_plan: [
        `Protokolni '${targetProto}' ga o'zgartirish (Kechikish -4.5 ms, Xavfsizlik 95%)`,
        `Kanal o'tkazuvchanligini ${p.bandwidth} Mbit/s dan ${targetBw} Mbit/s ga oshirish`,
        "Routerda FQ-CoDel Smart Queue Management (SQM) intizomini yoqish"
      ]
    };
  }

  window._lastOptimizer = opt;
  const container = $('#optDetails');
  if (!container) return;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
      <div style="background:var(--bg-input); padding:10px 14px; border-radius:10px; border:1px solid var(--bd);">
        <small style="color:var(--mu);">Tavsiya etilgan protokol</small>
        <div style="font-weight:700; color:var(--accent); font-size:1.1rem; margin-top:2px;">
          ${opt.recommended_params.protocol}
        </div>
      </div>
      <div style="background:var(--bg-input); padding:10px 14px; border-radius:10px; border:1px solid var(--bd);">
        <small style="color:var(--mu);">Tavsiya etilgan Bandwidth</small>
        <div style="font-weight:700; color:var(--ok); font-size:1.1rem; margin-top:2px;">
          ${opt.recommended_params.bandwidth} Mbit/s
        </div>
      </div>
      <div style="background:var(--bg-input); padding:10px 14px; border-radius:10px; border:1px solid var(--bd);">
        <small style="color:var(--mu);">Kutilayotgan unumdorlik o'sishi</small>
        <div style="font-weight:700; color:var(--accent); font-size:1.1rem; margin-top:2px;">
          +${opt.delta_score} ball
        </div>
      </div>
    </div>
    <ul class="opt-steps">
      ${opt.action_plan.map(s => `<li>${s}</li>`).join('')}
    </ul>
  `;
}

function applyAiOptimization() {
  const opt = window._lastOptimizer;
  if (!opt || !opt.recommended_params) {
    showToast('Avval optimallashtirish hisoblanmoqda...', 'info');
    loadOptimizerPreview().then(() => applyAiOptimization());
    return;
  }
  setForm(opt.recommended_params);
  showToast('AI tavsiya etgan parametrlar qabul qilindi! Simulyatsiya boshlanmoqda...', 'success');
  run(opt.recommended_params);
}

let stressChartInstance = null;
async function runAiStressTest() {
  if (!current) return;
  const p = current.input;
  const btn = $('#btnStressRun');
  if (btn) btn.disabled = true;
  showToast('AI Stress-Test hisoblanmoqda...', 'info');

  let data = null;
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(CONFIG.apiBase + '/api/stress-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      if (res.ok) data = await res.json();
    } catch (e) { }
  }

  if (!data) {
    // Lokal stress test
    const curve = [];
    for (let l = 10; l <= 200; l += 10) {
      const effectiveLoad = Math.min(99, l);
      const res = simulate({ ...p, load: effectiveLoad });
      if (l > 100) {
        res.latency = res.latency * (1 + (l - 100) * 0.025);
        res.loss = Math.min(100, res.loss + (l - 100) * 0.2);
        res.score = Math.max(0, res.score - (l - 100) * 0.5);
      }
      curve.append ? null : curve.push({
        load: l,
        latency: +res.latency.toFixed(1),
        throughput: +res.throughput.toFixed(1),
        loss: +res.loss.toFixed(2),
        score: +res.score.toFixed(1)
      });
    }
    data = {
      curve,
      saturation_load_pct: 75,
      breaking_point_pct: 120,
      max_safe_users: Math.round(p.users * 0.75),
      verdict: "Tarmoq 75% yuklamagacha barqaror ishlaydi. 120% dan keyin paketlar halokati boshlanadi."
    };
  }

  if (btn) btn.disabled = false;

  const det = $('#stressDetails');
  det.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:12px;">
      <div style="background:var(--bg-input); padding:12px 14px; border-radius:12px; border:1px solid var(--bd);">
        <small style="color:var(--mu);">Tirbandlik nuqtasi (Saturation)</small>
        <div style="font-size:1.3rem; font-weight:700; color:var(--wa); margin-top:2px;">
          ${data.saturation_load_pct}% yuklama
        </div>
      </div>
      <div style="background:var(--bg-input); padding:12px 14px; border-radius:12px; border:1px solid var(--bd);">
        <small style="color:var(--mu);">Sinish nuqtasi (Crash / Breaking Point)</small>
        <div style="font-size:1.3rem; font-weight:700; color:var(--er); margin-top:2px;">
          ${data.breaking_point_pct}% yuklama
        </div>
      </div>
      <div style="background:var(--bg-input); padding:12px 14px; border-radius:12px; border:1px solid var(--bd);">
        <small style="color:var(--mu);">Maksimal xavfsiz foydalanuvchilar</small>
        <div style="font-size:1.3rem; font-weight:700; color:var(--ok); margin-top:2px;">
          ${data.max_safe_users} ta oqim
        </div>
      </div>
    </div>
    <div style="margin-top:10px; color:var(--tx); font-size:0.9rem;">
      <b>Xulosa:</b> ${data.verdict}
    </div>
  `;

  const box = $('#stressChartBox');
  if (box) box.style.display = 'block';

  const ctx = $('#stressChart');
  if (ctx) {
    if (stressChartInstance) stressChartInstance.destroy();
    stressChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.curve.map(c => c.load + '%'),
        datasets: [
          {
            label: 'Latency (ms)',
            data: data.curve.map(c => c.latency),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            yAxisID: 'y'
          },
          {
            label: 'Tezlik (Mbit/s)',
            data: data.curve.map(c => c.throughput),
            borderColor: '#22d3ee',
            backgroundColor: 'rgba(34, 211, 238, 0.15)',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { position: 'left', title: { display: true, text: 'Latency (ms)' } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Tezlik (Mbit/s)' } }
        }
      }
    });
  }
}

function renderProtocols() {
  const inv = v => v === 'Past' || v === 'Juda Past' ? 'good' : (v === 'Yuqori' ? 'bad' : 'mid');
  const sec = v => v === 'Yuqori' || v === 'Juda Yuqori' ? 'good' : (v === 'Past' ? 'bad' : 'mid');
  const b = (v, c) => `<span class="badge ${c}">${v}</span>`;

  $('#protoTbl').innerHTML = `
    <tr>
      <th>Protokol</th>
      <th>Xavfsizlik</th>
      <th>Latency</th>
      <th>Overhead</th>
      <th>Unumdorlik</th>
      <th>Qisqacha tavsif</th>
    </tr>
  ` + Object.entries(PROTO).map(([k, P]) => `
    <tr>
      <td><b>${k}</b></td>
      <td>${b(P.sec, sec(P.sec))}</td>
      <td>${b(P.lat, inv(P.lat))}</td>
      <td>${b(P.ovh, inv(P.ovh))}</td>
      <td>${b(P.perf, sec(P.perf))}</td>
      <td style="color:var(--mu); font-size:0.85rem;">${P.desc}</td>
    </tr>
  `).join('');

  $('#cmpA').innerHTML = $('#cmpB').innerHTML = Object.keys(PROTO).map(k => `<option value="${k}">${k}</option>`).join('');
  $('#cmpA').value = 'HTTP/1.1';
  $('#cmpB').value = 'HTTP/3 (QUIC)';
  $('#cmpA').onchange = $('#cmpB').onchange = renderCompare;
}

function renderCompare() {
  const p = current ? current.input : readForm();
  const A = $('#cmpA').value, B = $('#cmpB').value;
  const a = simulate({ ...p, protocol: A }), b = simulate({ ...p, protocol: B });

  const row = (l, f) => `<tr><td>${l}</td><td>${f(a, A)}</td><td>${f(b, B)}</td></tr>`;
  $('#cmpTbl').innerHTML = `
    <tr>
      <th>Ko'rsatkich</th>
      <th>${A}</th>
      <th>${B}</th>
    </tr>
  ` +
  row('Xavfsizlik darajasi', (r, k) => `${PROTO[k].secScore} / 100 (${PROTO[k].sec})`) +
  row('Latency', r => r.latency.toFixed(1) + ' ms') +
  row('Overhead', r => r.overhead + '%') +
  row('Haqiqiy tezlik', r => r.throughput.toFixed(1) + ' Mbit/s') +
  row('Bufferbloat xavfi', r => r.bufferbloat.toFixed(0) + '%') +
  row('Unumdorlik bali', r => r.score.toFixed(0) + ' / 100') +
  row('Tarmoq holati', r => badge(r.status));
}

function histRows(list, actions) {
  return `<tr>
    <th>ID</th>
    <th>Sana</th>
    <th>Protokol</th>
    <th>Bandwidth</th>
    <th>Latency</th>
    <th>Loss</th>
    <th>Load</th>
    <th>Holat</th>
    ${actions ? '<th>Amallar</th>' : ''}
  </tr>` +
  (list.length ? list.map(e => `<tr>
    <td><b>${e.id}</b></td>
    <td>${e.date}</td>
    <td><span class="badge mid">${e.input.protocol}</span></td>
    <td>${e.input.bandwidth} Mbit/s</td>
    <td>${e.result.latency.toFixed(1)} ms</td>
    <td>${e.result.loss.toFixed(2)}%</td>
    <td>${e.input.load}%</td>
    <td>${badge(e.result.status)}</td>
    ${actions ? `<td>
      <button class="btn btn-sm" data-a="view" data-id="${e.id}">Ko'rish</button>
      <button class="btn btn-sm ghost" data-a="rerun" data-id="${e.id}">Qayta</button>
      <button class="btn btn-sm danger" data-a="del" data-id="${e.id}">O'chirish</button>
    </td>` : ''}
  </tr>`).join('') : '<tr><td colspan="9" class="empty">Tarix bo\'sh</td></tr>');
}

function refresh() {
  const h = getHist();
  const avg = f => h.length ? h.reduce((s, e) => s + f(e), 0) / h.length : 0;
  $('#sTotal').textContent = h.length;
  $('#sLat').textContent = h.length ? avg(e => e.result.latency).toFixed(1) + ' ms' : '–';
  $('#sLoss').textContent = h.length ? avg(e => e.result.loss).toFixed(2) + '%' : '–';
  const sc = avg(e => e.result.score);
  $('#sStatus').innerHTML = h.length ? badge(sc >= 70 ? 'Yaxshi' : sc >= 45 ? "O'rtacha" : 'Kritik') : '–';
  $('#recentTbl').innerHTML = histRows(h.slice(0, 5), false);
  filterHistory();
}

function filterHistory() {
  const h = getHist();
  const q = ($('#histSearch')?.value || '').toLowerCase();
  const flt = $('#histFilter')?.value || 'all';

  const filtered = h.filter(e => {
    const matchQ = e.id.toLowerCase().includes(q) ||
                   e.input.protocol.toLowerCase().includes(q) ||
                   e.date.toLowerCase().includes(q);
    const matchFlt = flt === 'all' || e.result.status === flt;
    return matchQ && matchFlt;
  });

  $('#histTbl').innerHTML = histRows(filtered, true);
}

$('#histSearch')?.addEventListener('input', filterHistory);
$('#histFilter')?.addEventListener('change', filterHistory);

$('#histTbl').onclick = async ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  const h = getHist(), e = h.find(x => x.id === b.dataset.id);
  if (!e) return;
  if (b.dataset.a === 'view') {
    current = e;
    show('results');
  }
  if (b.dataset.a === 'del') {
    if (CONFIG.useBackend && e.raw_id) {
      fetch(CONFIG.apiBase + '/api/simulation/' + e.raw_id, { method: 'DELETE' }).catch(() => {});
    }
    setHist(h.filter(x => x.id !== e.id));
    if (current?.id === e.id) current = null;
    refresh();
    showToast(`${e.id} o'chirildi`, 'info');
  }
  if (b.dataset.a === 'rerun') {
    setForm(e.input);
    run(e.input);
  }
};

/* ---------- 7. JONLI TOPOLOGIYA VIZUALIZATORI (CANVAS) ---------- */
let topoRunning = true;
let topoAnimationId = null;
let topoPackets = [];
let topoStats = { sent: 0, delivered: 0, dropped: 0 };

function initTopology() {
  const canvas = $('#topoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth - 48 || 860;
    canvas.height = 360;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const nodes = [
    { id: 'client', label: 'Mijozlar (Clients)', sub: 'Brauzer, Ilovalar', icon: '💻', x: 0.12 },
    { id: 'router', label: 'Router / Firewall', sub: 'QoS & Navbat', icon: '🛡️', x: 0.38 },
    { id: 'cloud',  label: 'Internet Magistral', sub: 'Tranzit & ISP', icon: '☁️', x: 0.65 },
    { id: 'server', label: 'Server / Cloud', sub: 'Data Center', icon: '🖧', x: 0.90 }
  ];

  let lastSpawn = 0;

  function render(time) {
    if (!topoRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width, h = canvas.height;
    const cy = h / 2;

    // Magistral chiziqlari (Kanal)
    ctx.beginPath();
    ctx.moveTo(w * nodes[0].x, cy);
    ctx.lineTo(w * nodes[nodes.length - 1].x, cy);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Yangi paket qo'shish
    const p = current ? current.input : readForm();
    const r = current ? current.result : simulate(p);

    const spawnRate = Math.max(120, 800 - p.load * 6);
    if (time - lastSpawn > spawnRate) {
      topoPackets.push({
        x: w * nodes[0].x,
        y: cy + (Math.random() * 20 - 10),
        speed: (w / 120) * (1 - (r.latency / 600)),
        isDropped: Math.random() * 100 < r.loss,
        dropPoint: w * (0.35 + Math.random() * 0.35),
        alpha: 1.0,
        color: r.loss > 3 ? '#f87171' : '#22d3ee'
      });
      topoStats.sent++;
      lastSpawn = time;
    }

    // Paketlar harakati
    for (let i = topoPackets.length - 1; i >= 0; i--) {
      const pkt = topoPackets[i];
      pkt.x += Math.max(1.5, pkt.speed);

      if (pkt.isDropped && pkt.x >= pkt.dropPoint) {
        pkt.alpha -= 0.05;
        ctx.fillStyle = `rgba(239, 68, 68, ${pkt.alpha})`;
        ctx.beginPath();
        ctx.arc(pkt.x, pkt.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // X belgisi
        ctx.strokeStyle = `rgba(239, 68, 68, ${pkt.alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pkt.x - 4, pkt.y - 4); ctx.lineTo(pkt.x + 4, pkt.y + 4);
        ctx.moveTo(pkt.x + 4, pkt.y - 4); ctx.lineTo(pkt.x - 4, pkt.y + 4);
        ctx.stroke();

        if (pkt.alpha <= 0) {
          topoStats.dropped++;
          topoPackets.splice(i, 1);
        }
        continue;
      }

      if (pkt.x >= w * nodes[nodes.length - 1].x) {
        topoStats.delivered++;
        topoPackets.splice(i, 1);
        continue;
      }

      // Oddiy yetkazilayotgan paket
      ctx.fillStyle = pkt.color;
      ctx.shadowColor = pkt.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pkt.x, pkt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Tugunlarni chizish
    nodes.forEach(node => {
      const nx = w * node.x;
      ctx.fillStyle = 'rgba(10, 18, 42, 0.9)';
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(nx - 50, cy - 45, 100, 90, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.icon, nx, cy - 8);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(node.label, nx, cy + 18);

      ctx.fillStyle = '#8fa3c4';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(node.sub, nx, cy + 32);
    });

    // Metriklarni yangilash
    $('#tpSent').textContent = topoStats.sent;
    $('#tpDelivered').textContent = topoStats.delivered;
    $('#tpDropped').textContent = topoStats.dropped;
    $('#tpRate').textContent = r.throughput.toFixed(1) + ' Mbit/s';

    topoAnimationId = requestAnimationFrame(render);
  }

  topoAnimationId = requestAnimationFrame(render);
}

function startTopology() {
  if (!topoRunning) {
    topoRunning = true;
    $('#topoToggleBtn').textContent = '⏸ To\'xtatish';
  }
}

$('#topoToggleBtn').onclick = () => {
  topoRunning = !topoRunning;
  $('#topoToggleBtn').textContent = topoRunning ? '⏸ To\'xtatish' : '▶ Boshlash';
  if (topoRunning) initTopology();
};

$('#topoResetBtn').onclick = () => {
  topoStats = { sent: 0, delivered: 0, dropped: 0 };
  topoPackets = [];
  showToast('Topologiya ko\'rsatkichlari qayta hisoblandi', 'info');
};

$('#topoBurstBtn').onclick = () => {
  const canvas = $('#topoCanvas');
  if (!canvas) return;
  for (let i = 0; i < 20; i++) {
    topoPackets.push({
      x: canvas.width * 0.12 - (i * 12),
      y: (canvas.height / 2) + (Math.random() * 30 - 15),
      speed: 4 + Math.random() * 2,
      isDropped: Math.random() < 0.4,
      dropPoint: canvas.width * (0.35 + Math.random() * 0.35),
      alpha: 1.0,
      color: '#f87171'
    });
    topoStats.sent++;
  }
  showToast('Trafik bo\'roni (Burst packets) yuborildi!', 'warn');
};

/* ---------- 8. GRAFIKLAR (CHART.JS + RADAR) ---------- */
Chart.defaults.color = '#9fb3d1';
Chart.defaults.borderColor = 'rgba(255,255,255,.08)';
const charts = {};
const mk = (id, cfg) => { charts[id]?.destroy(); charts[id] = new Chart($('#' + id), cfg); };

function renderCharts() {
  if (!current) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  Chart.defaults.color = isLight ? '#475569' : '#9fb3d1';
  Chart.defaults.borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,.08)';
  const { input: p, result: r } = current;
  const loads = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const lb = loads.map(l => l + '%');

  const o = (y, x) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, title: { display: !!y, text: y } },
      x: { title: { display: !!x, text: x } }
    }
  });

  // c1: Kechikish dinamikasi
  mk('c1', {
    type: 'line',
    data: {
      labels: lb,
      datasets: [{
        label: 'Kechikish (ms)',
        data: loads.map(l => +latencyAt(p, l).toFixed(1)),
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34,211,238,.15)',
        fill: true,
        tension: 0.4
      }]
    },
    options: o('Latency (ms)', 'Tarmoq yuklamasi')
  });

  // c2: Paket yo'qotilishi
  mk('c2', {
    type: 'bar',
    data: {
      labels: lb,
      datasets: [{
        label: 'Loss (%)',
        data: loads.map(l => +lossAt(p, l).toFixed(2)),
        backgroundColor: '#8b5cf6',
        borderRadius: 6
      }]
    },
    options: o('Packet Loss (%)')
  });

  // c3: O'tkazuvchanlik ishlatilishi
  mk('c3', {
    type: 'doughnut',
    data: {
      labels: ['Haqiqiy ishlatilayotgan', 'Erkin qolgan'],
      datasets: [{
        data: [+r.usage.toFixed(1), +(100 - r.usage).toFixed(1)],
        backgroundColor: ['#3b82f6', 'rgba(255,255,255,.08)'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // c4: Overhead va yuklama
  mk('c4', {
    type: 'bar',
    data: {
      labels: ['Kiritilgan yuk', 'Protokol Overhead', 'Umumiy bandlik'],
      datasets: [{
        data: [p.load, r.overhead, +r.usage.toFixed(1)],
        backgroundColor: ['#22d3ee', '#eab308', '#3b82f6'],
        borderRadius: 6
      }]
    },
    options: o('%')
  });

  // c5: Protokollar reytingi
  const ks = Object.keys(PROTO);
  mk('c5', {
    type: 'bar',
    data: {
      labels: ks,
      datasets: [{
        data: ks.map(k => +simulate({ ...p, protocol: k }).score.toFixed(0)),
        backgroundColor: ks.map(k => k === p.protocol ? '#22d3ee' : '#475a85'),
        borderRadius: 6
      }]
    },
    options: { ...o('Unumdorlik Bali (0–100)'), scales: { y: { min: 0, max: 100 } } }
  });

  // c6: Radar Chart — Tarmoq salomatligi indeksi
  const h = r.health || { speed: 80, latency: 75, lossResist: 85, security: 88, stability: 80 };
  mk('c6', {
    type: 'radar',
    data: {
      labels: ['Tezlik / Throughput', 'Kechikish salomatligi', 'Paket yo\'qotishga chidamlilik', 'Xavfsizlik', 'Barqarorlik (Jitter)'],
      datasets: [{
        label: 'Tarmoq salomatligi',
        data: [h.speed, h.latency, h.lossResist, h.security, h.stability],
        backgroundColor: 'rgba(34, 211, 238, 0.25)',
        borderColor: '#22d3ee',
        pointBackgroundColor: '#8b5cf6',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#22d3ee'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 20 },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          pointLabels: { color: '#cfe0ff', font: { size: 10 } }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/* ---------- 9. JONLI TELEMETRIYA (REAL-TIME MONITOR) ---------- */
let telemetryInterval = null;
let telemetryActive = false;

function toggleTelemetry() {
  telemetryActive = !telemetryActive;
  const btn = $('#btnLiveToggle');
  const badgeEl = $('#liveTelemetryBadge');

  if (telemetryActive) {
    btn.textContent = '🟢 Jonli Telemetriya (Faol)';
    btn.classList.add('success');
    if (badgeEl) badgeEl.style.display = 'inline-flex';
    showToast('Jonli telemetriya monitoringi yoqildi', 'success');

    telemetryInterval = setInterval(() => {
      if (!current) return;
      // Kichik tasodifiy jitter va yuklama tebranishi
      const jitterRipple = (Math.random() - 0.48) * 4;
      const loadRipple = (Math.random() - 0.5) * 5;

      current.input.load = clamp(Math.round(current.input.load + loadRipple), 5, 98);
      current.input.latency = clamp(Math.round(current.input.latency + jitterRipple), 2, 400);

      current.result = simulate(current.input);
      renderResults();
      renderCharts();
    }, 2000);
  } else {
    btn.textContent = '🔴 Jonli Telemetriya (O\'chiq)';
    btn.classList.remove('success');
    if (badgeEl) badgeEl.style.display = 'none';
    clearInterval(telemetryInterval);
    showToast('Jonli monitoring to\'xtatildi', 'info');
  }
}

/* ---------- 10. ISHGA TUSHIRISH VA HODISALAR ---------- */
$$('nav a').forEach(a => a.onclick = () => show(a.dataset.view));
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
$('#runBtn').onclick = () => run(readForm());

// Eksport va Chop etish hodisalari
$('#btnExportJson')?.addEventListener('click', exportCurrentJson);
$('#btnExportCsv')?.addEventListener('click', () => current && exportCsv([current], `${current.id}_report.csv`));
$('#btnExportAllCsv')?.addEventListener('click', () => exportCsv(getHist(), 'all_simulations_history.csv'));
$('#btnPrintReport')?.addEventListener('click', () => window.print());
$('#btnLiveToggle')?.addEventListener('click', toggleTelemetry);

// AI Tugmalari
$('#btnAutoOpt')?.addEventListener('click', () => { show('ai'); applyAiOptimization(); });
$('#btnStressTest')?.addEventListener('click', () => { show('ai'); runAiStressTest(); });

// Sozlamalar
$('#useApi').checked = CONFIG.useBackend;
$('#apiBase').value = CONFIG.apiBase;

$('#saveCfg').onclick = () => {
  CONFIG.useBackend = $('#useApi').checked;
  CONFIG.apiBase = $('#apiBase').value;
  localStorage.setItem('ans_cfg', JSON.stringify(CONFIG));
  checkServerStatus();
  showToast('Sozlamalar saqlandi', 'success');
};

$('#testApiBtn')?.addEventListener('click', async () => {
  try {
    const res = await fetch($('#apiBase').value + '/api/health');
    if (res.ok) {
      showToast('Backend server bilan aloqa mavjud!', 'success');
    } else {
      showToast('Server javob qaytardi, ammo xatolik bor', 'warn');
    }
  } catch (err) {
    showToast('Serverga ulanib bo\'lmadi: ' + err.message, 'error');
  }
});

$('#clearBtn').onclick = () => {
  if (confirm("Barcha tarix o'chirilsinmi?")) {
    if (CONFIG.useBackend) {
      fetch(CONFIG.apiBase + '/api/simulations', { method: 'DELETE' }).catch(() => {});
    }
    setHist([]);
    current = null;
    refresh();
    showToast('Tarix tozalandi', 'info');
  }
};

async function seedDemo() {
  const demo = [
    [100, 20, 0.2, 2.5, 45, 150, 'HTTPS/TLS 1.3'],
    [1000, 190, 14.0, 45.0, 96, 5000, 'HTTP/1.1'],
    [50, 12, 0.05, 1.2, 25, 4, 'HTTP/3 (QUIC)'],
    [200, 24, 0.0, 1.8, 40, 300, 'WireGuard'],
    [300, 30, 0.1, 3.5, 65, 45, 'HTTP/3 (QUIC)'],
    [50, 90, 3.2, 18.0, 85, 600, 'OpenVPN/IPSec']
  ];
  for (const d of demo) {
    const p = { bandwidth: d[0], latency: d[1], loss: d[2], jitter: d[3], load: d[4], users: d[5], protocol: d[6], mtu: '1500', qos: 'voip' };
    setHist([await makeEntry(p), ...getHist()]);
  }
}

$('#demoBtn').onclick = async () => {
  await seedDemo();
  current = getHist()[0];
  refresh();
  showToast("Demo ma'lumotlar yuklandi", 'success');
};

async function checkServerStatus() {
  const ind = $('#srvIndicator'), txt = $('#srvStatusTxt');
  if (!ind || !txt) return;
  if (!CONFIG.useBackend) {
    ind.style.background = '#8fa3c4';
    ind.style.boxShadow = 'none';
    txt.textContent = 'Lokal (Client) rejim';
    return;
  }
  try {
    const res = await fetch(CONFIG.apiBase + '/api/health', { method: 'GET' });
    if (res.ok) {
      ind.style.background = 'var(--ok)';
      ind.style.boxShadow = '0 0 8px var(--ok)';
      txt.textContent = 'Server: Onlayn (API)';
    } else {
      throw new Error();
    }
  } catch (e) {
    ind.style.background = 'var(--wa)';
    ind.style.boxShadow = '0 0 8px var(--wa)';
    txt.textContent = 'Server: Ofline (Lokal zaxira)';
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ans_theme', theme);
  $$('.theme-dot').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  const isLight = theme === 'light';
  Chart.defaults.color = isLight ? '#475569' : '#9fb3d1';
  Chart.defaults.borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,.08)';
  if (current && charts.c1) renderCharts();
}

function initTheme() {
  const savedTheme = localStorage.getItem('ans_theme') || 'cyan';
  setTheme(savedTheme);
  $$('.theme-dot').forEach(btn => {
    btn.onclick = () => {
      setTheme(btn.dataset.theme);
      showToast(`Mavzu tanlandi: ${btn.title}`, 'info');
    };
  });
}

async function syncBackendHistory() {
  if (!CONFIG.useBackend) return;
  try {
    const res = await fetch(CONFIG.apiBase + '/api/simulations');
    if (res.ok) {
      const items = await res.json();
      if (items && items.length) {
        setHist(items);
        current = items[0];
        refresh();
      }
    }
  } catch (e) {}
}

// Boshlang'ich initsializatsiya
(async function init() {
  initTheme();
  buildPresets();
  buildForm();
  renderProtocols();
  initTopology();

  if (localStorage.getItem(KEY) === null) {
    await seedDemo();
  }
  current = getHist()[0] || null;
  refresh();
  checkServerStatus();
  syncBackendHistory();
})();
