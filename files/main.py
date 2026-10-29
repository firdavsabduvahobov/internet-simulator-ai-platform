"""
AI Network Simulator — Advanced Industrial Backend & ML Engine
FastAPI + scikit-learn (agar o'rnatilgan bo'lsa) YOKI Standart Python Pure-ML (pip talab qilinmaydi).
Avtomatik ikkita rejimda ishlaydi:
  1) uvicorn main:app --reload (FastAPI rejimi)
  2) python3 main.py yoki python3 server.py (Standart Python 100% mustaqil rejim)
"""
import os
import sys
import math
import json
import random
import sqlite3
import urllib.parse
from datetime import datetime
from pathlib import Path
from contextlib import closing

# Joylashuv va Ma'lumotlar bazasi
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "simulator.db"
PORT = 8080

# -------------------------------------------------------------
# PROTOKOLLAR MODELI
# -------------------------------------------------------------
PROTOCOLS = {
    'HTTPS/TLS 1.3': {
        'sec': 'Yuqori',
        'latAdd': 4.0,
        'ovhPct': 4.5,
        'secScore': 88,
        'rtts': 1.0,
        'cpu': 0.8,
        'desc': 'Zamonaviy TLS 1.3 shifrlash, 1-RTT handshake, AES-GCM/ChaCha20'
    },
    'HTTP/3 (QUIC)': {
        'sec': 'Juda Yuqori',
        'latAdd': 2.0,
        'ovhPct': 3.0,
        'secScore': 95,
        'rtts': 0.5,
        'cpu': 0.5,
        'desc': 'UDP asosidagi 0-RTT tezkor ulanish, ko\'p oqimli, paket yo\'qolishiga chidamli'
    },
    'WireGuard': {
        'sec': 'Juda Yuqori',
        'latAdd': 5.0,
        'ovhPct': 5.0,
        'secScore': 96,
        'rtts': 1.0,
        'cpu': 0.4,
        'desc': 'Zamonaviy ChaCha20-Poly1305, yengil Linux/OS yadro darajasidagi VPN'
    },
    'OpenVPN/IPSec': {
        'sec': 'Yuqori',
        'latAdd': 18.0,
        'ovhPct': 14.0,
        'secScore': 90,
        'rtts': 3.0,
        'cpu': 2.2,
        'desc': 'Og\'ir korporativ IKEv2 / SSL-VPN shifrlangan tunnellari'
    },
    'SSH': {
        'sec': 'Yuqori',
        'latAdd': 7.0,
        'ovhPct': 6.0,
        'secScore': 85,
        'rtts': 3.0,
        'cpu': 1.2,
        'desc': 'Xavfsiz terminal va SSH tunnellash, Diffie-Hellman KEX'
    },
    'WebSocket': {
        'sec': 'O\'rta',
        'latAdd': 2.5,
        'ovhPct': 2.5,
        'secScore': 70,
        'rtts': 1.0,
        'cpu': 0.3,
        'desc': 'Doimiy ikki tomonlama real-vaqt aloqa kanali'
    },
    'HTTP/1.1': {
        'sec': 'Past',
        'latAdd': 1.0,
        'ovhPct': 2.0,
        'secScore': 15,
        'rtts': 2.0,
        'cpu': 0.1,
        'desc': 'Shifrlanmagan ochiq matn, MITM xavfi yuqori, Head-of-Line blokirovkasi'
    },
    'NONE': {
        'sec': 'Yo\'q',
        'latAdd': 0.0,
        'ovhPct': 0.0,
        'secScore': 0,
        'rtts': 1.0,
        'cpu': 0.0,
        'desc': 'Himoyasiz ochiq paketlar (etalon taqqoslash uchun)'
    }
}

# Aliaslar (eski va yangi nomlarni moslashtirish)
PROTO_ALIASES = {
    'TLS': 'HTTPS/TLS 1.3',
    'IPsec': 'OpenVPN/IPSec',
    'QUIC': 'HTTP/3 (QUIC)',
    'VPN': 'WireGuard'
}

PLIST = list(PROTOCOLS.keys())
STATUS_LABELS = ['Kritik', 'O\'rtacha', 'Yaxshi', 'A\'lo']

def normalize_proto(name):
    if not name:
        return 'HTTPS/TLS 1.3'
    if name in PROTOCOLS:
        return name
    if name in PROTO_ALIASES:
        return PROTO_ALIASES[name]
    for k in PROTOCOLS:
        if name.lower() in k.lower():
            return k
    return 'HTTPS/TLS 1.3'

def clamp(v, a, b):
    return max(a, min(b, v))

# -------------------------------------------------------------
# ILMIY TARMOQ MATEMATIKASI VA SIMULYATSIYA DVIGATELI
# -------------------------------------------------------------
def simulate_physics(bw, lat, loss, load, proto_name, jitter=3.0, users=150, qos='none', mtu=1500):
    proto_name = normalize_proto(proto_name)
    p = PROTOCOLS[proto_name]

    bw = float(max(1.0, bw))
    lat = float(max(0.5, lat))
    loss = float(clamp(loss, 0.0, 100.0))
    load = float(clamp(load, 0.0, 100.0))
    jitter = float(max(0.0, jitter))
    users = float(max(1.0, users))
    mtu = int(mtu or 1500)

    # QoS boshqaruvi
    qos_lat_mult = 1.0
    qos_loss_mult = 1.0
    qos_jit_mult = 1.0
    if qos in ('codel', 'cake'):
        qos_lat_mult = 0.72   # FQ-CoDel / Cake aqlli navbatda kechikishni 28% ga pasaytiradi
        qos_loss_mult = 0.85
        qos_jit_mult = 0.65
    elif qos == 'voip':
        qos_lat_mult = 0.82
        qos_loss_mult = 0.70  # VoIP paketlar yo'qolishiga ustuvor himoya
        qos_jit_mult = 0.50

    # MTU omili (Jumbo paketlar samaradorligi)
    mtu_eff = 1.0
    if mtu >= 9000:
        mtu_eff = 1.03
    elif mtu < 1500:
        mtu_eff = 0.97

    # Tarmoq kanali bandligi (Utilization - rho)
    user_pressure = (users / max(5.0, bw * 12.0)) * 0.18
    rho = clamp((load / 100.0) + user_pressure, 0.01, 0.985)

    # M/M/1 va M/M/c/K navbat kechikishi nazariyasi (Queuing delay)
    # rho -> 1 bo'lganda navbat eksponensial o'sadi
    queue_delay = lat * (0.65 * rho / (1.0 - rho)) * qos_lat_mult
    effective_lat = lat + queue_delay + p['latAdd'] + p['cpu']

    # Tirbandlikda paket yo'qotilishi (Packet drops in congestion)
    load_penalty = max(0.0, load - 62.0) * 0.075 * (1.0 + rho ** 2)
    effective_loss = clamp((loss + load_penalty + p['ovhPct'] * 0.018) * qos_loss_mult, 0.0, 100.0)

    # Jitter (Kechikish tebranishi)
    effective_jitter = (jitter * (1.0 + 1.4 * rho) + (effective_loss * 0.55)) * qos_jit_mult

    # Mathis TCP Throughput formulasi (Mathis et al.):
    # Throughput <= (MSS * C) / (RTT * sqrt(Loss))
    # Parallel oqimlar:
    flows = clamp(math.ceil(users * 0.15), 1, 40)
    mss = max(500, mtu - 40)
    mathis_limit = bw * 1000.0  # default juda katta
    if effective_loss > 0.01:
        mathis_limit = flows * (1.22 * mss * 8.0) / ((effective_lat / 1000.0) * math.sqrt(effective_loss / 100.0)) / 1e6

    # Jismoniy kanal o'tkazuvchanligi
    physical_capacity = bw * (1.0 - (p['ovhPct'] / 100.0)) * (1.0 - (load / 230.0)) * mtu_eff
    throughput = max(0.01, min(physical_capacity, mathis_limit))

    # Real foydali tezlik (Goodput)
    goodput = max(0.01, throughput * (1.0 - (p['ovhPct'] / 100.0)))

    # Tarmoq amaliy yuklanishi (Usage)
    usage = clamp(load + p['ovhPct'] * 0.4 + (users / max(1.0, bw)) * 1.5, 0.0, 100.0)

    # Handshake vaqti (ms)
    handshake_ms = p['rtts'] * effective_lat

    # Bufferbloat xavfi indeksi (0 - 100)
    lat_growth = max(0.0, effective_lat - lat)
    bufferbloat = clamp((lat_growth / max(1.0, lat)) * 55.0 + (load * 0.4), 0.0, 100.0)

    # Bandwidth-Delay Product (BDP) KB larda (TCP oyna o'lchami tavsiyasi)
    bdp_kb = max(1.0, (throughput * 1e6 / 8.0) * (effective_lat / 1000.0) / 1024.0)

    # Samaradorlik foizi
    efficiency = clamp((goodput / bw) * 100.0, 0.5, 100.0)

    # Integral reyting (0 - 100)
    score = 100.0 \
            - min(35.0, effective_lat * 0.18) \
            - min(35.0, effective_loss * 6.5) \
            - (load * 0.18) \
            - (p['ovhPct'] * 0.35) \
            - (bufferbloat * 0.14)
    score = clamp(round(score, 1), 0.0, 100.0)

    # Holat darajasi
    if score >= 82.0:
        status = 'A\'lo'
    elif score >= 65.0:
        status = 'Yaxshi'
    elif score >= 42.0:
        status = 'O\'rtacha'
    else:
        status = 'Kritik'

    return {
        'protocol': proto_name,
        'latency_ms': round(effective_lat, 2),
        'packet_loss': round(effective_loss, 2),
        'throughput_mbps': round(throughput, 2),
        'goodput_mbps': round(goodput, 2),
        'jitter_ms': round(effective_jitter, 2),
        'handshake_ms': round(handshake_ms, 2),
        'overhead_pct': p['ovhPct'],
        'security_score': p['secScore'],
        'security_level': p['sec'],
        'usage_pct': round(usage, 1),
        'efficiency_pct': round(efficiency, 1),
        'bufferbloat_score': round(bufferbloat, 1),
        'bdp_kb': round(bdp_kb, 1),
        'overall_score': score,
        'status': status,
        'health_metrics': {
            'bandwidth': round(clamp(100 - (load * 0.75), 10, 100)),
            'latency': round(clamp(100 - (effective_lat * 0.28), 10, 100)),
            'loss': round(clamp(100 - (effective_loss * 16), 5, 100)),
            'security': p['secScore'],
            'stability': round(clamp(100 - (effective_jitter * 2.8), 10, 100))
        }
    }

def run_full_simulation(params):
    bw = float(params.get('bandwidth', 100))
    lat = float(params.get('latency', 35))
    loss = float(params.get('loss', params.get('packet_loss', 0.5)))
    load = float(params.get('load', params.get('network_load', 50)))
    proto = normalize_proto(params.get('protocol', 'HTTPS/TLS 1.3'))
    jitter = float(params.get('jitter', 3.0))
    users = float(params.get('users', 150))
    qos = str(params.get('qos', 'none')).lower()
    mtu = int(params.get('mtu', 1500) or 1500)

    current = simulate_physics(bw, lat, loss, load, proto, jitter, users, qos, mtu)

    # 8 ta protokol bo'yicha to'liq solishtiruv
    comparison = [
        simulate_physics(bw, lat, loss, load, k, jitter, users, qos, mtu)
        for k in PLIST
    ]

    # Yuklama oshishi dinamikasi (10% dan 95% gacha)
    curve = [
        {
            'load': l,
            **simulate_physics(bw, lat, loss, l, proto, jitter, users, qos, mtu)
        }
        for l in range(10, 100, 10)
    ]

    return {
        'current': current,
        'comparison': comparison,
        'curve': curve
    }

# -------------------------------------------------------------
# SUN'IY INTELLEKT (AI) VA MASHINALI O'RGANISH (ML) MODULI
# -------------------------------------------------------------
class PurePythonDecisionTree:
    """Zero-dependency sof Python qaror daraxti (Decision Tree with Gini Split)"""
    def __init__(self, max_depth=6, min_samples_split=4):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.tree = None

    def _gini(self, y):
        if not y: return 0.0
        n = len(y)
        counts = {}
        for c in y: counts[c] = counts.get(c, 0) + 1
        return 1.0 - sum((cnt / n) ** 2 for cnt in counts.values())

    def _build_tree(self, X, y, depth=0):
        n_samples = len(y)
        if depth >= self.max_depth or n_samples < self.min_samples_split or len(set(y)) <= 1:
            counts = {}
            for c in y: counts[c] = counts.get(c, 0) + 1
            return {'leaf': True, 'counts': counts, 'total': n_samples}

        best_gain = -1.0
        best_split = None
        current_gini = self._gini(y)
        n_features = len(X[0])

        # Random feature subsampling (Random Forest usuli)
        feat_subset = random.sample(range(n_features), max(2, int(math.sqrt(n_features) + 1)))

        for feat in feat_subset:
            vals = [row[feat] for row in X]
            unique_vals = sorted(set(vals))
            if len(unique_vals) > 10:
                # Kvantillardan namunalar olish
                step = len(unique_vals) // 8
                test_vals = [unique_vals[i] for i in range(step, len(unique_vals), max(1, step))]
            else:
                test_vals = unique_vals

            for thresh in test_vals:
                left_idx = [i for i, row in enumerate(X) if row[feat] <= thresh]
                right_idx = [i for i, row in enumerate(X) if row[feat] > thresh]
                if not left_idx or not right_idx:
                    continue

                left_y = [y[i] for i in left_idx]
                right_y = [y[i] for i in right_idx]
                gain = current_gini - (len(left_y)/n_samples * self._gini(left_y) + len(right_y)/n_samples * self._gini(right_y))
                if gain > best_gain:
                    best_gain = gain
                    best_split = (feat, thresh, left_idx, right_idx)

        if best_gain <= 0.001 or best_split is None:
            counts = {}
            for c in y: counts[c] = counts.get(c, 0) + 1
            return {'leaf': True, 'counts': counts, 'total': n_samples}

        feat, thresh, left_idx, right_idx = best_split
        return {
            'leaf': False,
            'feature': feat,
            'threshold': thresh,
            'left': self._build_tree([X[i] for i in left_idx], [y[i] for i in left_idx], depth + 1),
            'right': self._build_tree([X[i] for i in right_idx], [y[i] for i in right_idx], depth + 1)
        }

    def fit(self, X, y):
        self.tree = self._build_tree(X, y)
        return self

    def _predict_row(self, node, row):
        if node['leaf']:
            return node['counts'], node['total']
        if row[node['feature']] <= node['threshold']:
            return self._predict_row(node['left'], row)
        return self._predict_row(node['right'], row)

    def predict_proba(self, row, classes):
        counts, total = self._predict_row(self.tree, row)
        return [counts.get(c, 0) / max(1, total) for c in classes]

class PurePythonForest:
    """Ansambl Random Forest (20 ta mustaqil daraxtlar klasteri)"""
    def __init__(self, n_estimators=20):
        self.n_estimators = n_estimators
        self.trees = []
        self.classes = STATUS_LABELS

    def fit(self, X, y):
        self.trees = []
        n = len(X)
        for _ in range(self.n_estimators):
            # Bootstrap namuna
            indices = [random.randint(0, n - 1) for _ in range(n)]
            bx = [X[i] for i in indices]
            by = [y[i] for i in indices]
            t = PurePythonDecisionTree(max_depth=5, min_samples_split=5).fit(bx, by)
            self.trees.append(t)
        return self

    def predict_proba(self, feat):
        res = {c: 0.0 for c in self.classes}
        for t in self.trees:
            probs = t.predict_proba(feat, self.classes)
            for c, p in zip(self.classes, probs):
                res[c] += p
        for c in res:
            res[c] = res[c] / self.n_estimators
        return res

# AI Modelini o'qitish
AI_MODEL = None
USE_SKLEARN = False

def train_network_ai():
    global AI_MODEL, USE_SKLEARN
    random.seed(42)

    X, y = [], []
    for _ in range(3500):
        bw = math.exp(random.uniform(math.log(2), math.log(1000)))
        lat = random.uniform(2, 350)
        loss = random.uniform(0, 20)
        load = random.uniform(5, 98)
        proto_idx = random.randint(0, len(PLIST) - 1)
        jitter = random.uniform(0.5, 40)
        users = random.uniform(5, 3000)

        res = simulate_physics(bw, lat, loss, load, PLIST[proto_idx], jitter, users)
        label = res['status']

        feat = [bw, lat, loss, load, proto_idx, jitter, users]
        X.append(feat)
        y.append(label)

    try:
        from sklearn.ensemble import RandomForestClassifier
        import numpy as np
        clf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
        clf.fit(X, y)
        AI_MODEL = clf
        USE_SKLEARN = True
        print("✓ AI: scikit-learn RandomForestClassifier muvaffaqiyatli o'qitildi.")
    except Exception:
        forest = PurePythonForest(n_estimators=20).fit(X, y)
        AI_MODEL = forest
        USE_SKLEARN = False
        print("✓ AI: Pure-Python Intelligent Random Forest muvaffaqiyatli o'qitildi (Standart kutubxona).")

# Dastlabki AI yuklash
train_network_ai()

# -------------------------------------------------------------
# XATARLAR VA KIBER-XAVFSIZLIK ANOMALIYALARINI ANIQLASH
# -------------------------------------------------------------
def detect_cyber_threats(p, r):
    anomalies = []
    load = float(p.get('load', p.get('network_load', 50)))
    users = float(p.get('users', 150))
    proto = normalize_proto(p.get('protocol', 'HTTPS/TLS 1.3'))
    loss = r['packet_loss']
    lat = r['latency_ms']
    jitter = r['jitter_ms']
    bufferbloat = r['bufferbloat_score']

    # 1. DDoS / Paketlar bo'roni xavfi
    if (load >= 90.0 and users >= 1000) or load >= 97.0:
        anomalies.append({
            'id': 'DDOS_STORM',
            'name': 'DDoS / Trafik Bo\'roni Anomaliyasi',
            'severity': 'critical',
            'desc': f'Trafik va so\'rovlar oqimi o\'ta yuqori ({load}% yuklama, {int(users)} faol oqim). Tarmoq kommutatorlari buferlari to\'lib ketgan.',
            'mitigation': 'Yuklamani balanslovchi (Load Balancer) klaster o\'rnating va Rate-Limiting / Cloudflare himoyasini yoqing.'
        })

    # 2. Bufferbloat Falokati
    if bufferbloat >= 65.0:
        anomalies.append({
            'id': 'BUFFERBLOAT_DISASTER',
            'name': 'Kritik Bufferbloat (Navbat To\'lishi)',
            'severity': 'critical' if bufferbloat >= 80 else 'warning',
            'desc': f'Navbatlar kechikishi sababli latency {lat} ms ga oshdi. Bufer indeksi: {bufferbloat}%.',
            'mitigation': 'FQ-CoDel yoki CAKE aqlli navbat algoritmini (Smart Queue Management) yoqing.'
        })

    # 3. Kiber-zaiflik: Shifrlanmagan ochiq trafik
    if proto in ('HTTP/1.1', 'NONE'):
        anomalies.append({
            'id': 'UNENCRYPTED_MITM',
            'name': 'Kiber-Xavfsizlik Zaifligi (Ochiq Oqim)',
            'severity': 'critical',
            'desc': f'{proto} ishlatilmoqda. Paketlar shifrlanmagan! Trafik o\'g\'irlanishi (Sniffing) va Man-in-the-Middle (MITM) xavfi 100%.',
            'mitigation': 'Zudlik bilan HTTPS/TLS 1.3 yoki HTTP/3 (QUIC) protokollariga o\'ting.'
        })

    # 4. TCP Retransmissiya halokati
    if loss >= 3.0:
        anomalies.append({
            'id': 'RETRANSMISSION_STORM',
            'name': 'TCP Retransmissiya Bo\'roni',
            'severity': 'critical' if loss >= 7.0 else 'warning',
            'desc': f'Paket yo\'qotilishi {loss}% ga yetdi. TCP mexanizmi to\'xtovsiz takroriy so\'rovlar yuborib kanalni to\'liq bo\'g\'ib qo\'ymoqda.',
            'mitigation': 'Aloqa kanalini fizik tekshiring yoki MTU o\'lchamini MSS ga moslang.'
        })

    # 5. Jitter tebranishi (VoIP va Video degradatsiyasi)
    if jitter >= 15.0:
        anomalies.append({
            'id': 'HIGH_JITTER',
            'name': 'Katta Jitter Tebranishi',
            'severity': 'warning',
            'desc': f'Jitter {jitter} ms tashkil etmoqda. Video aloqa va IP-telefoniyada so\'zlar uzilishi va robot ovozi yuzaga keladi.',
            'mitigation': 'QoS VoIP ustuvorlik qoidasini yoqing va jitter buferini 25 ms ga sozlang.'
        })

    # 6. Og'ir VPN Overhead sekinlashuvi
    if proto == 'OpenVPN/IPSec' and r['overhead_pct'] >= 12.0 and r['overall_score'] < 60:
        anomalies.append({
            'id': 'HEAVY_CRYPTO_BOTTLENECK',
            'name': 'Og\'ir Kriptografik Overhead Sekinlashuvi',
            'severity': 'info',
            'desc': f'Klassik OpenVPN/IPsec tunnellari kanal kengligining {r["overhead_pct"]}% qismini shifrlash qo\'shimcha yuki bilan sarflamoqda.',
            'mitigation': 'Yengilroq va 3x tezroq zamonaviy WireGuard VPN protokoliga o\'ting.'
        })

    return anomalies

# -------------------------------------------------------------
# TUSHUNTIRILUVCHAN AI (XAI) VA FAKTORLAR TIKLANISHI
# -------------------------------------------------------------
def calculate_xai_impacts(p, r):
    load = float(p.get('load', p.get('network_load', 50)))
    loss = r['packet_loss']
    lat = r['latency_ms']
    ovh = r['overhead_pct']

    raw_load = load * 0.45
    raw_loss = loss * 12.0
    raw_lat = (lat / 15.0) * 1.5
    raw_ovh = ovh * 2.2

    total = max(0.1, raw_load + raw_loss + raw_lat + raw_ovh)

    impacts = {
        'Tarmoq yuklamasi (Load)': round((raw_load / total) * 100, 1),
        'Paket yo\'qotilishi (Packet Loss)': round((raw_loss / total) * 100, 1),
        'Kechikish (Latency)': round((raw_lat / total) * 100, 1),
        'Protokol qo\'shimcha yuki (Overhead)': round((raw_ovh / total) * 100, 1)
    }

    top_factor = max(impacts, key=impacts.get)
    return impacts, top_factor

# -------------------------------------------------------------
# TO'LIQ AI EKSPERT TAHLILI
# -------------------------------------------------------------
def analyze_network_ai(p, r):
    bw = float(p.get('bandwidth', 100))
    lat = float(p.get('latency', 35))
    loss = float(p.get('loss', p.get('packet_loss', 0.5)))
    load = float(p.get('load', p.get('network_load', 50)))
    proto = normalize_proto(p.get('protocol', 'HTTPS/TLS 1.3'))
    jitter = float(p.get('jitter', 3.0))
    users = float(p.get('users', 150))

    proto_idx = PLIST.index(proto) if proto in PLIST else 0
    feat = [bw, lat, loss, load, proto_idx, jitter, users]

    # Model orqali ehtimolliklar
    if USE_SKLEARN:
        import numpy as np
        proba = AI_MODEL.predict_proba([feat])[0]
        probs = {c: round(float(prob) * 100, 1) for c, prob in zip(AI_MODEL.classes_, proba)}
        predicted_health = AI_MODEL.classes_[int(proba.argmax())]
    else:
        probs = AI_MODEL.predict_proba(feat)
        for c in probs:
            probs[c] = round(probs[c] * 100, 1)
        predicted_health = max(probs, key=probs.get)

    # Kiber-tahdidlar va anomaliyalar
    anomalies = detect_cyber_threats(p, r)

    # XAI
    impacts, top_factor = calculate_xai_impacts(p, r)

    # Tavsiyalar va harakatlar
    recommendations = []
    if load >= 75:
        recommendations.append(f"Tarmoq yuklamasi yuqori ({load}%). Kanal o'tkazuvchanligini (Bandwidth) kamida {(bw*1.5):.0f} Mbit/s ga oshirish yoki trafikni taqsimlovchi klaster joriy etish tavsiya etiladi.")
    if r['packet_loss'] >= 1.5:
        recommendations.append(f"Paket yo'qotilishi ({r['packet_loss']}%) TCP retransmissiyasiga sabab bo'lmoqda. FQ-CoDel yoki CAKE algoritmiga ega Smart Queue Management (SQM) o'rnating.")
    if proto in ('HTTP/1.1', 'NONE'):
        recommendations.append("Xavfsizlik darajasi juda past! Ma'lumotlarni shifrlash uchun zudlik bilan HTTP/3 (QUIC) yoki HTTPS/TLS 1.3 protokoliga o'ting.")
    if r['bufferbloat_score'] >= 50:
        recommendations.append(f"Bufferbloat xavfi yuqori ({r['bufferbloat_score']}%). Routerdagi FIFO navbat buferini qisqartiring yoki CoDel profilini tanlang.")
    if r['jitter_ms'] >= 15:
        recommendations.append("Jitter me'yordan ortiq. IP-telefoniya va real-vaqt trafigi uchun VoIP QoS ustuvorligini belgilang.")

    if not recommendations:
        recommendations.append("Tarmoq sozlamalari ideal holatda! Barcha parametrlar SLA standartlariga to'liq javob beradi.")

    # Protokollar ballarini hisoblash
    proto_scores = {}
    for k in PLIST:
        res_k = simulate_physics(bw, lat, loss, load, k, jitter, users)
        proto_scores[k] = res_k['overall_score']

    return {
        'cls': r['status'],
        'predicted_health': predicted_health,
        'overall_score': r['overall_score'],
        'probabilities': probs,
        'anomalies': anomalies,
        'xai_impacts': impacts,
        'top_factor': top_factor,
        'recommendations': recommendations,
        'protocol_scores': proto_scores,
        'risks': [a['name'] for a in anomalies] if anomalies else ['Jiddiy tahdid aniqlanmadi']
    }

# -------------------------------------------------------------
# AI AVTOMATIK OPTIMALLASHTIRUVCHI (Prescriptive Optimizer)
# -------------------------------------------------------------
def optimize_network_ai(params):
    bw = float(params.get('bandwidth', 100))
    lat = float(params.get('latency', 35))
    loss = float(params.get('loss', params.get('packet_loss', 0.5)))
    load = float(params.get('load', params.get('network_load', 50)))
    proto = normalize_proto(params.get('protocol', 'HTTPS/TLS 1.3'))
    jitter = float(params.get('jitter', 3.0))
    users = float(params.get('users', 150))

    original = simulate_physics(bw, lat, loss, load, proto, jitter, users)

    # Optimal protokol tanlash
    best_proto = proto
    best_score = original['overall_score']

    for candidate in ('HTTP/3 (QUIC)', 'WireGuard', 'HTTPS/TLS 1.3'):
        cand_res = simulate_physics(bw, lat, loss, load, candidate, jitter, users)
        if cand_res['overall_score'] > best_score:
            best_score = cand_res['overall_score']
            best_proto = candidate

    # Kerakli Bandwidth hisoblash
    target_bw = bw
    target_load = load
    if load > 60:
        multiplier = load / 45.0
        target_bw = round(bw * multiplier)
        target_load = 45.0

    target_qos = 'codel' if load > 65 else 'voip'
    target_mtu = 1500

    optimized = simulate_physics(target_bw, lat, min(loss, 0.2), target_load, best_proto, min(jitter, 2.5), users, target_qos, target_mtu)

    steps = []
    if best_proto != proto:
        steps.append(f"Protokolni '{proto}' dan zamonaviy '{best_proto}' ga o'tkazish (Kechikish -{(original['latency_ms']-optimized['latency_ms']):.1f} ms, Xavfsizlik {PROTOCOLS[best_proto]['secScore']}%)")
    if target_bw > bw:
        steps.append(f"Kanal o'tkazuvchanligini {bw} Mbit/s dan {target_bw} Mbit/s ga oshirish (Yuklama {load}% dan {target_load}% ga pasayadi)")
    steps.append(f"Routerda '{target_qos.upper()}' Smart Queue Management navbat intizomini faollashtirish")

    return {
        'original': original,
        'optimized': optimized,
        'delta_score': round(optimized['overall_score'] - original['overall_score'], 1),
        'recommended_params': {
            'bandwidth': target_bw,
            'latency': lat,
            'packet_loss': min(loss, 0.2),
            'network_load': target_load,
            'protocol': best_proto,
            'jitter': min(jitter, 2.5),
            'users': users,
            'qos': target_qos,
            'mtu': target_mtu
        },
        'action_plan': steps
    }

# -------------------------------------------------------------
# AI STRESS-TEST (Crash Test & Breaking Point Analyzer)
# -------------------------------------------------------------
def stress_test_network(params):
    bw = float(params.get('bandwidth', 100))
    lat = float(params.get('latency', 35))
    loss = float(params.get('loss', params.get('packet_loss', 0.5)))
    proto = normalize_proto(params.get('protocol', 'HTTPS/TLS 1.3'))
    users = float(params.get('users', 150))

    curve = []
    saturation_load = None
    breaking_point = None

    for l in range(10, 201, 10):
        # 100% dan yuqori yuklamalarda
        effective_load = min(99.0, l)
        extra_users = users * (l / 100.0)
        res = simulate_physics(bw, lat, loss, effective_load, proto, 3.0, extra_users)

        if l > 100:
            res['latency_ms'] = round(res['latency_ms'] * (1 + (l - 100) * 0.025), 1)
            res['packet_loss'] = round(min(100.0, res['packet_loss'] + (l - 100) * 0.2), 2)
            res['overall_score'] = round(max(0.0, res['overall_score'] - (l - 100) * 0.5), 1)

        curve.append({
            'load': l,
            'latency': res['latency_ms'],
            'throughput': res['throughput_mbps'],
            'loss': res['packet_loss'],
            'score': res['overall_score']
        })

        if saturation_load is None and res['latency_ms'] >= lat * 1.8:
            saturation_load = l

        if breaking_point is None and (res['packet_loss'] >= 8.0 or res['overall_score'] <= 35.0):
            breaking_point = l

    max_safe_users = int(max(10, users * ((saturation_load or 75) / 100.0)))

    return {
        'curve': curve,
        'saturation_load_pct': saturation_load or 70,
        'breaking_point_pct': breaking_point or 120,
        'max_safe_users': max_safe_users,
        'verdict': f"Tarmoq {saturation_load or 70}% yuklamagacha barqaror ishlaydi. {breaking_point or 120}% dan keyin paketlar halokati boshlanadi."
    }

# -------------------------------------------------------------
# MA'LUMOTLAR BAZASI (SQLite3)
# -------------------------------------------------------------
def init_database():
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS simulations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                name TEXT,
                params TEXT,
                results TEXT,
                ai TEXT,
                score REAL,
                status TEXT
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS stress_tests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT,
                params TEXT,
                results TEXT
            )
        """)
        con.commit()

init_database()

def db_query(sql, args=(), fetch=True):
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        cur = con.execute(sql, args)
        rows = cur.fetchall() if fetch else []
        last_id = cur.lastrowid
        con.commit()
        return last_id, rows

def save_simulation_db(params, results, ai=None):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    name = f"Simulyatsiya {params.get('protocol', 'TLS')}"
    score = results['current']['overall_score']
    status = results['current']['status']
    last_id, _ = db_query(
        "INSERT INTO simulations (created_at, name, params, results, ai, score, status) VALUES (?,?,?,?,?,?,?)",
        (now, name, json.dumps(params), json.dumps(results), json.dumps(ai) if ai else None, score, status),
        fetch=False
    )
    return last_id, now

def get_simulation_db(sim_id):
    _, rows = db_query("SELECT * FROM simulations WHERE id=?", (sim_id,))
    if not rows:
        return None
    r = rows[0]
    return {
        'id': r['id'],
        'created_at': r['created_at'],
        'name': r['name'],
        'params': json.loads(r['params']),
        'results': json.loads(r['results']),
        'ai': json.loads(r['ai']) if r['ai'] else None,
        'score': r['score'],
        'status': r['status']
    }

def get_all_simulations_db(query="", status="all", limit=100):
    sql = "SELECT id, created_at, name, params, results, score, status FROM simulations"
    clauses, args = [], []
    if status and status != 'all':
        clauses.append("status = ?")
        args.append(status)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(limit)

    _, rows = db_query(sql, tuple(args))
    items = []
    for r in rows:
        p = json.loads(r['params'])
        res = json.loads(r['results'])
        if query:
            q_lower = query.lower()
            if not (q_lower in str(r['id']) or q_lower in p.get('protocol', '').lower() or q_lower in r['created_at']):
                continue
        items.append({
            'id': f"SIM-{r['id']:03d}",
            'raw_id': r['id'],
            'date': r['created_at'],
            'input': p,
            'result': {
                'latency': res['current']['latency_ms'],
                'loss': res['current']['packet_loss'],
                'throughput': res['current']['throughput_mbps'],
                'score': r['score'],
                'status': r['status'],
                'overhead': res['current']['overhead_pct'],
                'bufferbloat': res['current']['bufferbloat_score']
            }
        })
    return items

def delete_simulation_db(sim_id):
    db_query("DELETE FROM simulations WHERE id=?", (sim_id,), fetch=False)

def clear_all_simulations_db():
    db_query("DELETE FROM simulations", fetch=False)

# -------------------------------------------------------------
# FASTAPI ILOVA INTEGRATSIYASI (Mavjud bo'lsa)
# -------------------------------------------------------------
try:
    import fastapi
    from fastapi import FastAPI, HTTPException, Request, Response
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse
    from pydantic import BaseModel, Field
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

if HAS_FASTAPI:
    app = FastAPI(
        title="AI Network Simulator — Advanced Engine",
        description="Internet unumdorligi va xavfsizlik protokollari simulyatori (FastAPI + ML + SQLite)",
        version="2.0.0"
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"]
    )

    class SimInput(BaseModel):
        bandwidth: float = 100.0
        latency: float = 35.0
        loss: float = 0.5
        load: float = 50.0
        protocol: str = "HTTPS/TLS 1.3"
        jitter: float = 3.0
        users: int = 150
        qos: str = "none"
        mtu: int = 1500

    @app.get("/")
    def serve_index():
        return FileResponse(BASE_DIR / "index.html")

    @app.get("/style.css")
    def serve_css():
        return FileResponse(BASE_DIR / "style.css", media_type="text/css")

    @app.get("/script.js")
    def serve_js():
        return FileResponse(BASE_DIR / "script.js", media_type="application/javascript")

    @app.get("/api/health")
    def api_health():
        return {
            'status': 'ok',
            'server': 'FastAPI Pro AI Engine',
            'ml_engine': 'scikit-learn RandomForest' if USE_SKLEARN else 'Pure-Python Forest',
            'protocols_count': len(PROTOCOLS),
            'database': str(DB_PATH)
        }

    @app.get("/api/protocols")
    def api_protocols():
        return PROTOCOLS

    @app.post("/api/simulation")
    def api_simulate(data: SimInput):
        p = data.model_dump()
        results = run_full_simulation(p)
        ai = analyze_network_ai(p, results['current'])
        sim_id, created_at = save_simulation_db(p, results, ai)
        return {
            'id': f"SIM-{sim_id:03d}",
            'raw_id': sim_id,
            'created_at': created_at,
            'params': p,
            'results': results,
            'ai': ai
        }

    @app.get("/api/simulation/{sim_id}")
    def api_get_sim(sim_id: int):
        sim = get_simulation_db(sim_id)
        if not sim:
            raise HTTPException(404, "Simulyatsiya topilmadi")
        return sim

    @app.get("/api/simulations")
    def api_list_sims(q: str = "", status: str = "all"):
        return get_all_simulations_db(query=q, status=status)

    @app.delete("/api/simulation/{sim_id}")
    def api_del_sim(sim_id: int):
        delete_simulation_db(sim_id)
        return {'status': 'deleted', 'id': sim_id}

    @app.delete("/api/simulations")
    def api_clear_sims():
        clear_all_simulations_db()
        return {'status': 'cleared'}

    @app.post("/api/ai/analyze")
    async def api_ai_analyze(request: Request):
        body = await request.json()
        p = body
        res = body.get('result') or simulate_physics(
            body.get('bandwidth', 100),
            body.get('latency', 35),
            body.get('loss', 0.5),
            body.get('load', 50),
            body.get('protocol', 'HTTPS/TLS 1.3'),
            body.get('jitter', 3.0),
            body.get('users', 150)
        )
        return analyze_network_ai(p, res)

    @app.post("/api/ai/optimize")
    async def api_ai_optimize(request: Request):
        body = await request.json()
        return optimize_network_ai(body)

    @app.post("/api/stress-test")
    async def api_stress_test(request: Request):
        body = await request.json()
        return stress_test_network(body)

# -------------------------------------------------------------
# STANDART PYTHON HTTP SERVERI (100% MUSTAQIL ZERO-DEP REJIM)
# -------------------------------------------------------------
import http.server
import socketserver

class StandaloneSimServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _json(self, data, code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == '/api/health':
            self._json({
                'status': 'ok',
                'server': 'Python Standalone AI Engine',
                'ml_engine': 'Pure-Python Forest' if not USE_SKLEARN else 'scikit-learn',
                'protocols_count': len(PROTOCOLS),
                'database': str(DB_PATH)
            })
            return

        if path == '/api/protocols':
            self._json(PROTOCOLS)
            return

        if path == '/api/simulations':
            q_txt = query.get('q', [''])[0]
            st = query.get('status', ['all'])[0]
            self._json(get_all_simulations_db(query=q_txt, status=st))
            return

        if path.startswith('/api/simulation/'):
            try:
                sid = int(path.split('/')[-1])
                sim = get_simulation_db(sid)
                if sim:
                    self._json(sim)
                else:
                    self._json({'error': 'Topilmadi'}, 404)
            except Exception:
                self._json({'error': 'Noto\'g\'ri ID'}, 400)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b'{}'
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            data = {}

        if path == '/api/simulation':
            results = run_full_simulation(data)
            ai = analyze_network_ai(data, results['current'])
            sim_id, created_at = save_simulation_db(data, results, ai)
            self._json({
                'id': f"SIM-{sim_id:03d}",
                'raw_id': sim_id,
                'created_at': created_at,
                'params': data,
                'results': results,
                'ai': ai
            })
            return

        if path == '/api/ai/analyze':
            res = data.get('result') or simulate_physics(
                data.get('bandwidth', 100),
                data.get('latency', 35),
                data.get('loss', 0.5),
                data.get('load', 50),
                data.get('protocol', 'HTTPS/TLS 1.3'),
                data.get('jitter', 3.0),
                data.get('users', 150)
            )
            self._json(analyze_network_ai(data, res))
            return

        if path == '/api/ai/optimize':
            self._json(optimize_network_ai(data))
            return

        if path == '/api/stress-test':
            self._json(stress_test_network(data))
            return

        self._json({'error': 'Endpoint topilmadi'}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/simulations':
            clear_all_simulations_db()
            self._json({'status': 'cleared'})
            return

        if path.startswith('/api/simulation/'):
            try:
                sid = int(path.split('/')[-1])
                delete_simulation_db(sid)
                self._json({'status': 'deleted', 'id': sid})
            except Exception:
                self._json({'error': 'Noto\'g\'ri ID'}, 400)
            return

        self._json({'error': 'Endpoint topilmadi'}, 404)

def run_builtin_server(port=PORT):
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), StandaloneSimServer) as httpd:
        print("=" * 60)
        print(f"🚀 AI Network Simulator Pro server ishga tushdi!")
        print(f"🔗 Brauzerda ochish: http://localhost:{port}")
        print(f"📁 Papka: {BASE_DIR}")
        print(f"🧠 AI Rejimi: {'scikit-learn ML' if USE_SKLEARN else 'Pure-Python Decision Forest (pip talab qilinmaydi)'}")
        print(f"💾 SQLite Baza: {DB_PATH}")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer to'xtatildi.")

if __name__ == '__main__':
    if HAS_FASTAPI:
        try:
            import uvicorn
            print("🚀 FastAPI / Uvicorn serveri ishga tushirilmoqda...")
            uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
        except Exception:
            run_builtin_server(PORT)
    else:
        run_builtin_server(PORT)
