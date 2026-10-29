# Internet unumdorligi va xavfsizlik protokollarini baholash simulyatori

**Internet Performance and Security Protocols Evaluation Simulator** — zamonaviy tarmoq fizikasi, xavfsizlik va shifrlash protokollari (HTTP/1.1, TLS 1.3, HTTP/3 QUIC, WireGuard, OpenVPN/IPsec, SSH, WebSocket) hamda sun'iy intellekt (AI/ML) diagnostikasini o'zida jamlagan professional ko'p rolli ta'limiy va ilmiy platforma.

---

## 👥 1. Foydalanuvchi Rollari va Alohida Dashboardlar

Platformada 4 ta to'liq mustaqil rol va ularning alohida boshqaruv panellari yaratilgan:

1. **Talaba (Student)**:
   - Shaxsiy kabinet va akademik ko'rsatkichlar (KPI).
   - Laboratoriya ishlari katalogi va topshiriqlarni o'rganish.
   - Laboratoriya parametrlarini simulyatorga 1-bosishda yuklash.
   - Tarmoq simulyatsiyasini o'tkazish, protokollarni taqqoslash.
   - Laboratoriya hisobotini yozish va o'qituvchiga tekshirish uchun yuborish.
   - Baholar, o'qituvchi taqrizlari va simulyatsiyalar tarixini kuzatish.

2. **O'qituvchi (Teacher)**:
   - Akademik guruhlar va talabalar ro'yxatini boshqarish.
   - Talabalar faolligi va o'rtacha o'zlashtirish ko'rsatkichlarini tahlil qilish.
   - Yangi laboratoriya topshiriqlari yaratish, guruhga biriktirish va muddat belgilash.
   - Talabalar tomonidan topshirilgan laboratoriya hisobotlarini tekshirish.
   - 0 dan 100 ballgacha baholash, taqriz va fikr-mulohazalar qoldirish.

3. **Tarmoq mutaxassisi (Network Specialist)**:
   - Chuqur tarmoq diagnostikasi va fizik hisoblashlar:
     - **Mathis TCP formulasi**: $T \le \frac{MSS \cdot 1.22}{RTT \cdot \sqrt{p}}$
     - **M/M/1 va M/M/c/K Navbat nazariyasi**: Kanal yuklamasi ($\rho \to 1$) bo'lganda router buferlarida kechikishning eksponensial o'sishi ($W_q = \frac{\rho}{\mu(1-\rho)}$).
     - **Bandwidth-Delay Product (BDP)**: Tarmoq sig'imi va optimal TCP oyna/socket buferini hisoblash.
     - **Goodput vs Throughput**: Kriptografik sarlavha va TLS/VPN yuki tufayli yo'qotilgan foydali tezlik.
   - 8 ta protokolning ko'p faktorli matritsasi (Latency, Overhead, Security, CPU, RTT).
   - Sun'iy intellekt (AI Suite) tahlili, Stress-test (10%-200% yuklama) va Avtomatik optimallashtiruvchi.
   - Jonli Topologiya Kanvasi va paketlar bo'roni (burst) testi.

4. **Administrator (Administrator)**:
   - Mustaqil va himoyalangan `/admin` boshqaruv paneli.
   - Foydalanuvchilar to'liq boshqaruvi (CRUD: qo'shish, tahrirlash, bloklash, parolni tiklash, o'chirish).
   - Rollar va Ruxsatlar tizimi (Role-Based Access Control — RBAC).
   - Laboratoriya shablonlari va barcha topshiriqlarni global nazorat qilish.
   - Xavfsizlik va audit jurnallari (`audit_logs`) monitoringi va filtrlash.
   - Tizim statistikasi, grafiklar va SQLite ma'lumotlar bazasi zaxira nusxasini yuklab olish (`JSON Dump`).
   - Ma'lumotlar bazasini defragmentatsiya va optimallashtirish (`VACUUM`).
   - Global tizim konfiguratsiyasi (`system_settings`).

---

## 🛡️ 2. Mustaqil Admin Panel (`/admin`)

Administrator paneli faqat `admin` roliga ega bo'lgan foydalanuvchilar uchun ochiq. Oddiy foydalanuvchi yoki mehmon `/admin` manziliga kirishga uringanda, RBAC tizimi darhol ruxsatni cheklaydi (HTTP 403 Forbidden).

Admin Panel quyidagi imkoniyatlarni taqdim etadi:
- **Foydalanuvchilar:** Har bir foydalanuvchining roli, holati (active/blocked), oxirgi kirish vaqti va profili.
- **Rollar va RBAC:** Har bir rolga biriktirilgan granular ruxsat kalitlari (`sim:run`, `lab:submit`, `submission:grade`, `admin:*` va b.).
- **Audit jurnallari:** Barcha kirishlar, ro'yxatdan o'tishlar, baholashlar, parollar o'zgarishi va xatolar real vaqtda qayd etiladi.
- **Baza boshqaruvi:** 13 ta asosiy jadvallar bo'yicha qatorlar soni, DB hajmi va 1-bosishda zaxira nusxasini yuklab olish.
- **Tizim sozlamalari:** Sayt sarlavhasi, ro'yxatdan o'tish holati, texnik tanaffus rejimi va b.

---

## 🗄️ 3. Ma'lumotlar Bazasi Sxemasi (13 ta Jadval)

Tizim relyatsion arxitekturaga ega bo'lib, SQLite3 da quyidagi 13 ta asosiy jadvallardan tashkil topgan:

| # | Jadval nomi | Vazifasi va Munosabatlari |
|---|---|---|
| 1 | `users` | Barcha foydalanuvchilar (id, username, email, password_hash, salt, full_name, role, status, created_at, last_login) |
| 2 | `roles` | Rollar katalogi (`student`, `teacher`, `specialist`, `admin`) |
| 3 | `permissions` | Granular huquqlar (FK `role_id` -> `roles.id`) |
| 4 | `student_profiles` | Talaba profili (FK `user_id` -> `users.id`, student_id_number, group_name, faculty) |
| 5 | `teacher_profiles` | O'qituvchi profili (FK `user_id` -> `users.id`, department, academic_degree, specialization, office_room) |
| 6 | `network_specialist_profiles` | Tarmoq mutaxassisi profili (FK `user_id` -> `users.id`, certifications, organization, experience_years, specialty_area) |
| 7 | `admin_profiles` | Admin profili (FK `user_id` -> `users.id`, admin_level, managed_department, phone_contact) |
| 8 | `laboratories` | Laboratoriya shablonlari (id, title, category, difficulty, instructions, default_params_json, expected_outcome) |
| 9 | `assignments` | Guruh topshiriqlari (FK `lab_id` -> `laboratories.id`, FK `teacher_id` -> `users.id`, group_name, due_date, max_score) |
| 10 | `lab_results` | Talaba hisoboti va baholari (FK `lab_id`, FK `student_id`, FK `graded_by`, student_notes, metrics_json, score, teacher_feedback, status) |
| 11 | `simulation_sessions` | Foydalanuvchi simulyatsiyalari tarixi (FK `user_id`, session_name, protocol, parameters, results_json, score, status) |
| 12 | `audit_logs` | Xavfsizlik hodisalari jurnali (FK `user_id`, username, action, entity_type, ip_address, status, created_at) |
| 13 | `system_settings` | Tizim parametrlari (setting_key, setting_value, category, description, updated_at) |

---

## 🔒 4. Xavfsizlik va Kriptografiya

- **PBKDF2 Parollar Xeshi**: Parollar xavfsiz tasodifiy salt (16 bayt) bilan `HMAC-SHA256` asosida 100,000 marta iteratsiya qilinib saqlanadi. Ochiq parollar bazaga yoki kodga yozilmaydi.
- **HMAC Signed Token Auth**: Sessiyalar kriptografik imzolangan xavfsiz tokenlar orqali amalga oshiriladi.
- **Role-Based Access Control (RBAC)**: Ruxsatlar ham frontendda, ham backendda qat'iy tekshiriladi (HTTP 401/403).
- **Admin huquqlarini cheklash**: Ro'yxatdan o'tish formasida administrator roliga ruxsat berilmaydi; admin faqat mavjud administrator tomonidan tayinlanadi.

---

## 🎨 5. Dizayn, Mavzular va Ko'p Tillilik (I18N)

- **Minimalist interfeys**: Oq fon, zamonaviy kartalar, yuqori kontrastli qora shriftlar va toza tipografiya.
- **Ranglar va Dark Mode**: Vanilla Cream (Standart), Dark Mode (Vanilla Mocha), Clean White va Cyber Cyan mavzulari.
- **3 ta Tilni to'liq qo'llab-quvvatlash**:
  - 🇺🇿 **O'zbekcha (UZ)**
  - 🇷🇺 **Русский (RU)**
  - 🇬🇧 **English (EN)**
- **Mobil moslashuvchanlik**: Planshet va smartfonlar uchun moslashuvchan layout va drawer menyu.

---

## 🚀 6. Ishga Tushirish Yo'riqnomasi

Loyihani ikki usulda ishga tushirish mumkin:

### 1-usul: FastAPI / Uvicorn (Tavsiya etiladi)

```bash
# Kerakli paketlarni o'rnatish
pip install -r requirements.txt

# Serverni ishga tushirish
python3 server.py
# yoki
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

Brauzerda oching: **`http://localhost:8080`**  
Admin panelga to'g'ridan-to'g'ri o'tish: **`http://localhost:8080/admin`**

### 2-usul: Standart Python (Nol tashqi kutubxona, pip talab qilinmaydi!)

```bash
python3 main.py
```

---

## 🔑 7. Test Hisoblari (Dastlabki kirish ma'lumotlari)

Tizimda barcha 4 ta rol uchun oldindan sozlangan test hisoblari mavjud. Kirish oynasida **"Tezkor test hisoblari"** tugmalarini 1 marta bosish orqali ham to'g'ridan-to'g'ri kirish mumkin:

| Rol | Login | Parol | To'liq Ism |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | Tizim Administratori |
| **O'qituvchi** | `oqituvchi` | `oqituvchi123` | Dotsent Bekzod Qodirov |
| **Talaba** | `talaba` | `talaba123` | Akrom Xoliqov (Talaba) |
| **Tarmoq Mutaxassisi** | `mutaxassis` | `mutaxassis123` | Sardor Aliyev (Tarmoq muhandisi) |

---

*Loyiha muallifi: Firdavs Abduvakhobov*
