# AI Network Simulator Pro (Kengaytirilgan Talqin)

Internet unumdorligi, zamonaviy xavfsizlik protokollari va paketlar oqimini sun'iy intellekt (AI) yordamida chuqur tahlil qiluvchi ilmiy-amaliy simulyator platformasi.

---

## 🚀 Asosiy Imkoniyatlar va Yangiliklar

### 1. Ilmiy Tarmoq Fizikasi va Matematikasi
- **Mathis TCP Formulasi**: Paket yo'qotilishi (Packet Loss) va RTT kechikishi ostida TCP o'tkazuvchanligining nazariy chegarasini real hisoblash ($T \le \frac{MSS \cdot C}{RTT \cdot \sqrt{p}}$).
- **M/M/1 & M/M/c/K Navbat Nazariyasi**: Kanal yuklamasi ($\rho \to 1$) oshganda kechikishning eksponensial o'sishi va buferbloat (Bufferbloat) inqirozini modellashtirish.
- **Bandwidth-Delay Product (BDP)**: Tarmoq sig'imi va optimal TCP oyna buferini (KB) aniqlash.
- **Goodput vs Throughput**: Protokol sarlavhalari, TLS yozuvlari va kriptografik overhead hisobiga foydali tezlikni ajratib ko'rsatish.
- **Smart Queue Management (SQM / QoS)**: `FQ-CoDel`, `CAKE`, `VoIP Priority` va `FIFO` navbat intizomlarining real ta'siri.

### 2. 8 ta Zamonaviy Tarmoq va VPN Protokollari
1. **HTTP/3 (QUIC)**: UDP asosidagi 0-RTT tezkor ulanish, ko'p oqimli (multiplexing), paket yo'qolishiga chidamli (95% xavfsizlik).
2. **HTTPS / TLS 1.3**: Zamonaviy AES-GCM / ChaCha20 shifrlash, 1-RTT handshake (88% xavfsizlik).
3. **WireGuard VPN**: Zamonaviy yengil va o'ta tezkor yadro darajasidagi kripto-tunnel (96% xavfsizlik).
4. **OpenVPN / IPsec**: Korporativ kuchli xavfsizlik, og'ir IKEv2 shifrlangan tunnellari (90% xavfsizlik).
5. **SSH (v2)**: Diffie-Hellman KEX xavfsiz terminal va ma'lumotlar tunnellash (85% xavfsizlik).
6. **WebSocket**: Doimiy ikki tomonlama real-vaqt ma'lumotlar oqimi (70% xavfsizlik).
7. **HTTP/1.1**: Shifrlanmagan ochiq matn, MITM xavfi yuqori (15% xavfsizlik).
8. **NONE**: Himoyasiz etalon ochiq trafik (0% xavfsizlik).

### 3. Kengaytirilgan Sun'iy Intellekt (AI Suite)
- **AI Health Classifier (Ansambl Model)**: 
  - Tarmoq holatini 4 toifada baholash: `A'lo (Optimal)`, `Yaxshi (Good)`, `O'rtacha (Fair)`, `Kritik (Critical)`.
  - Har bir sinf bo'yicha aniq ehtimollik taqsimoti (Probability Distribution).
  - `scikit-learn` o'rnatilgan bo'lsa RandomForest, o'rnatilmagan bo'lsa sof Python Decision Forest ansambli yordamida 100% mustaqil ishlaydi.
- **Explainable AI (XAI) Faktorlar Tahlili**:
  - Tarmoq degradatsiyasiga har bir omilning (Yuklama, Yo'qotish, Masofa, Protokol overhead) foizdagi ta'sirini ko'rsatish.
- **Kiber-Xavfsizlik va Anomaliyalarni Aniqlash**:
  - DDoS / Trafik bo'roni xavfi.
  - Kritik Bufferbloat (Navbat to'lishi).
  - Shifrlanmagan ochiq trafik (MITM / Sniffing zaifligi).
  - TCP Retransmissiya bo'roni.
  - Yuqori Jitter va VoIP sifati pasayishi.
- **AI Prescriptive Optimizer (Avtomatik Optimallashtiruvchi)**:
  - Mavjud muammoni tahlil qilib, optimal protokol, zaruriy kanal kengligi (Bandwidth) va QoS intizomini tavsiya qiladi.
  - Bir marta bosish orqali sozlamalarni qo'llash va kutilayotgan unumdorlik o'sishini (+ball) ko'rish.
- **AI Stress-Test (Crash Test)**:
  - 10% dan 200% gacha yuklama ostida sinov o'tkazib, *Tirbandlik nuqtasi (Saturation)*, *Sinish nuqtasi (Breaking Point)* va *Maksimal xavfsiz foydalanuvchilar soni*ni aniqlaydi.

### 4. Ma'lumotlar Bazasi va Doimiy Saqlash (SQLite3)
- Barcha simulyatsiyalar avtomatik ravishda `simulator.db` fayliga saqlanadi.
- Simulyatsiyalar tarixi bo'yicha qidiruv, holatlar bo'yicha filtrlash, qayta ishga tushirish, JSON va CSV eksport.

### 5. Foydalanuvchi Interfeysi (UI / UX)
- 6 ta zamonaviy dizayn mavzulari (Kiber Moviy, Neon Binafsha, Zumrad Yashil, Olovrang Sunset, Yorug' Rejim, Midnight OLED).
- Jonli Topologiya Kanvasi (Canvas) — real-vaqtda harakatlanuvchi va paketlar nobud bo'lishini ko'rsatuvchi jonli vizualizator.
- Chart.js asosidagi 6 xil interaktiv grafiklar va Radar indeksi.

---

## 🛠 Ishga Tushirish

Tizim mutlaqo mustaqil ishlab chiqilgan va tashqi kutubxonalarsiz ham (standart Python bilan) to'liq ishlay oladi!

### 1-usul: Standart Python bilan ishga tushirish (Hech qanday pip talab qilinmaydi!)
```bash
python3 server.py
# yoki
python3 main.py
```
Brauzerda oching: **`http://localhost:8080`**

### 2-usul: FastAPI & Uvicorn bilan ishga tushirish (Ixtiyoriy)
Agar FastAPI va scikit-learn mavjud bo'lsa:
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```
Brauzerda oching: **`http://localhost:8080`**  
Interaktiv API hujjati: **`http://localhost:8080/docs`**

---

## 📡 REST API Endpointlari

| Metod | Manzil | Tavsif |
|---|---|---|
| `GET` | `/` | Web interfeysni ochish |
| `GET` | `/api/health` | Tizim salomatligi va AI holati |
| `GET` | `/api/protocols` | 8 ta protokolning texnik parametrlari |
| `POST` | `/api/simulation` | Simulyatsiyani hisoblash va DB ga saqlash |
| `GET` | `/api/simulations` | Tarixdagi barcha simulyatsiyalarni olish |
| `GET` | `/api/simulation/{id}` | Bitta simulyatsiyani ID bo'yicha olish |
| `DELETE` | `/api/simulation/{id}` | Simulyatsiyani o'chirish |
| `DELETE` | `/api/simulations` | Tarixni to'liq tozalash |
| `POST` | `/api/ai/analyze` | AI neyron diagnostikasi va kiber-tahlil |
| `POST` | `/api/ai/optimize` | AI avtomatik optimallashtirish |
| `POST` | `/api/stress-test` | AI stress-test va bardoshlilik tahlili |
