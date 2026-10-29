"""
Database Layer for Internet Performance & Security Simulator
Barcha 13 ta asosiy jadvallar, munosabatlar, xavfsiz parollar va boshlang'ich ma'lumotlar.
"""
import os
import time
import json
import sqlite3
import hashlib
import binascii
from datetime import datetime
from pathlib import Path
from contextlib import closing

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "simulator.db"

# Parol va Token xavfsizlik funksiyalari
TOKEN_SECRET = b"sim-secret-key-salt-2026-secure"

def hash_password(password: str, salt: str = None) -> tuple:
    if not salt:
        salt = binascii.hexlify(os.urandom(16)).decode('utf-8')
    pw_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pw_hash, salt

def verify_password(password: str, pw_hash: str, salt: str) -> bool:
    calc_hash, _ = hash_password(password, salt)
    return hmac_compare(calc_hash, pw_hash)

def hmac_compare(a: str, b: str) -> bool:
    import hmac
    return hmac.compare_digest(a.encode('utf-8'), b.encode('utf-8'))

def generate_token(user_id: int, username: str, role: str, exp_hours: int = 24) -> str:
    import base64
    import hmac
    exp = int(time.time()) + (exp_hours * 3600)
    payload = {
        'uid': user_id,
        'usr': username,
        'rol': role,
        'exp': exp
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')
    sig = hmac.new(TOKEN_SECRET, raw.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"

def verify_token(token: str) -> dict:
    import base64
    import hmac
    if not token or '.' not in token:
        return None
    parts = token.split('.')
    if len(parts) != 2:
        return None
    raw, sig = parts[0], parts[1]
    expected_sig = hmac.new(TOKEN_SECRET, raw.encode('utf-8'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(raw.encode('utf-8')).decode('utf-8'))
        if data.get('exp', 0) < int(time.time()):
            return None  # Token muddati tugagan
        return data
    except Exception:
        return None

def get_db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con

def init_full_database():
    """Barcha 13 ta jadvalni yaratish va boshlang'ich ma'lumotlarni kiritish"""
    with closing(get_db()) as con:
        # Check if users table needs migration
        user_cols = [r['name'] for r in con.execute("PRAGMA table_info(users)").fetchall()]
        if user_cols and 'password_hash' not in user_cols:
            con.execute("DROP TABLE IF EXISTS users_old")
            con.execute("ALTER TABLE users RENAME TO users_old")

        # 1. ROLES
        con.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL
            )
        """)

        # 2. PERMISSIONS
        con.execute("""
            CREATE TABLE IF NOT EXISTS permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role_id INTEGER NOT NULL,
                permission_key TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            )
        """)

        # 3. USERS
        con.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login TEXT
            )
        """)

        # 4. STUDENT_PROFILES
        con.execute("""
            CREATE TABLE IF NOT EXISTS student_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                student_id_number TEXT,
                group_name TEXT DEFAULT '412-21 TATU',
                faculty TEXT DEFAULT 'Telekommunikatsiya texnologiyalari',
                enrollment_year INTEGER DEFAULT 2023,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 5. TEACHER_PROFILES
        con.execute("""
            CREATE TABLE IF NOT EXISTS teacher_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                department TEXT DEFAULT 'Kompyuter tarmoqlari',
                academic_degree TEXT DEFAULT 'Dotsent / PhD',
                specialization TEXT DEFAULT 'Axborot xavfsizligi va tarmoq protokollari',
                office_room TEXT DEFAULT '304-xona',
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 6. NETWORK_SPECIALIST_PROFILES
        con.execute("""
            CREATE TABLE IF NOT EXISTS network_specialist_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                certifications TEXT DEFAULT 'CCNP, CISSP, JNCIA',
                organization TEXT DEFAULT 'Uztelecom NOC / Senior NetOps',
                experience_years INTEGER DEFAULT 7,
                specialty_area TEXT DEFAULT 'Yuqori yuklamali tarmoqlar va kiberxavfsizlik',
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 7. ADMIN_PROFILES
        con.execute("""
            CREATE TABLE IF NOT EXISTS admin_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                admin_level TEXT DEFAULT 'SuperAdmin',
                managed_department TEXT DEFAULT 'Axborot texnologiyalari va simulyator boshqaruvi',
                phone_contact TEXT DEFAULT '+998 71 200-00-00',
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 8. LABORATORIES
        con.execute("""
            CREATE TABLE IF NOT EXISTS laboratories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT DEFAULT 'Protokollar',
                difficulty TEXT DEFAULT 'Orta',
                instructions TEXT,
                target_role TEXT DEFAULT 'student',
                default_params_json TEXT NOT NULL,
                expected_outcome TEXT,
                is_active INTEGER DEFAULT 1,
                created_by INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        """)

        # 9. ASSIGNMENTS
        con.execute("""
            CREATE TABLE IF NOT EXISTS assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lab_id INTEGER NOT NULL,
                teacher_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                group_name TEXT DEFAULT '412-21 TATU',
                due_date TEXT,
                max_score INTEGER DEFAULT 100,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE,
                FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 10. LAB_RESULTS
        con.execute("""
            CREATE TABLE IF NOT EXISTS lab_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assignment_id INTEGER,
                lab_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                simulation_id INTEGER,
                student_notes TEXT,
                submission_params_json TEXT,
                metrics_json TEXT,
                score REAL,
                teacher_feedback TEXT,
                status TEXT NOT NULL DEFAULT 'submitted',
                graded_by INTEGER,
                graded_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL,
                FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
            )
        """)

        # 11. SIMULATION_SESSIONS
        con.execute("""
            CREATE TABLE IF NOT EXISTS simulation_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                session_name TEXT NOT NULL,
                protocol TEXT NOT NULL,
                bandwidth REAL NOT NULL,
                latency REAL NOT NULL,
                packet_loss REAL NOT NULL,
                jitter REAL NOT NULL,
                network_load REAL NOT NULL,
                users_count INTEGER NOT NULL,
                qos TEXT DEFAULT 'none',
                mtu INTEGER DEFAULT 1500,
                results_json TEXT NOT NULL,
                ai_analysis_json TEXT,
                score REAL NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        """)

        # 12. AUDIT_LOGS
        con.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details TEXT,
                ip_address TEXT DEFAULT '127.0.0.1',
                user_agent TEXT,
                status TEXT DEFAULT 'SUCCESS',
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        """)

        # 13. SYSTEM_SETTINGS
        con.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                description TEXT,
                updated_by INTEGER,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
            )
        """)

        # Compatibility tables
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

        # Boshlang'ich ma'lumotlar bilan to'ldirish (Seeding)
        seed_initial_data(con)

def seed_initial_data(con):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Rollarni tekshirish va kiritish
    roles_data = [
        ('student', 'Talaba', 'Laboratoriya ishlarini bajarish, simulyatsiyalarni o\'rganish va o\'z natijalarini kuzatish.'),
        ('teacher', 'O\'qituvchi', 'Talabalar guruhlarini boshqarish, topshiriqlar yaratish va natijalarni baholash.'),
        ('specialist', 'Tarmoq mutaxassisi', 'Chuqur tarmoq diagnostikasi, protokollar solishtiruvi va kiberxavfsizlik tahlili.'),
        ('admin', 'Administrator', 'Foydalanuvchilar, rollar, ma\'lumotlar bazasi, tizim parametrlari va audit loglarini to\'liq boshqarish.')
    ]
    for name, disp, desc in roles_data:
        con.execute("""
            INSERT OR IGNORE INTO roles (name, display_name, description, created_at)
            VALUES (?, ?, ?, ?)
        """, (name, disp, desc, now))
    con.commit()

    # Rollar ID larini olish
    role_map = {row['name']: row['id'] for row in con.execute("SELECT id, name FROM roles").fetchall()}

    # 2. Permissions (Ruxsatlar)
    perms = [
        # Student
        ('student', 'sim:run', 'Tarmoq simulyatsiyasini ishga tushirish'),
        ('student', 'sim:view', 'Simulyatsiya natijalari va grafiklarini ko\'rish'),
        ('student', 'lab:view', 'Laboratoriya vazifalarini ko\'rish'),
        ('student', 'lab:submit', 'Laboratoriya hisobotini topshirish'),
        ('student', 'history:own', 'O\'z simulyatsiyalar tarixini ko\'rish'),

        # Teacher
        ('teacher', 'sim:run', 'Simulyatsiyalarni sinash'),
        ('teacher', 'sim:view', 'Simulyatsiyalar natijalarini ko\'rish'),
        ('teacher', 'lab:view', 'Laboratoriyalarni ko\'rish'),
        ('teacher', 'lab:create', 'Yangi laboratoriya topshiriqlarini yaratish'),
        ('teacher', 'assignment:manage', 'Guruh topshiriqlarini yaratish va tahrirlash'),
        ('teacher', 'submission:grade', 'Talabalar ishlarini baholash va fikr qoldirish'),
        ('teacher', 'students:view', 'Guruhlar va talabalar ro\'yxatini ko\'rish'),
        ('teacher', 'stats:view', 'O\'qituvchi statistikalarini ko\'rish'),

        # Specialist
        ('specialist', 'sim:run', 'Chuqur simulyatsiyalarni ishga tushirish'),
        ('specialist', 'sim:view', 'Barcha texnik ko\'rsatkichlarni ko\'rish'),
        ('specialist', 'diag:deep', 'Chuqur tarmoq fizikasi va matematikasi diagnostikasi'),
        ('specialist', 'protocol:compare', 'Barcha 8 ta protokolning ko\'p faktorli tahlili'),
        ('specialist', 'ai:stress_test', 'AI Stress-test (Crash-test) o\'tkazish'),
        ('specialist', 'ai:optimize', 'AI Prescriptive Optimizer tavsiyalarini hisoblash'),
        ('specialist', 'topology:live', 'Jonli topologiya va paketlar bo\'roni simulyatsiyasi'),
        ('specialist', 'report:export', 'To\'liq professional hisobotlarni eksport qilish'),

        # Admin
        ('admin', '*', 'Barcha tizim ruxsatlariga to\'liq ega (SuperAdmin)')
    ]

    for role_name, perm_key, desc in perms:
        r_id = role_map.get(role_name)
        if r_id:
            exists = con.execute("SELECT 1 FROM permissions WHERE role_id=? AND permission_key=?", (r_id, perm_key)).fetchone()
            if not exists:
                con.execute("""
                    INSERT INTO permissions (role_id, permission_key, description, created_at)
                    VALUES (?, ?, ?, ?)
                """, (r_id, perm_key, desc, now))
    con.commit()

    # 3. Foydalanuvchilar (Users)
    users_to_seed = [
        {
            'username': 'admin',
            'email': 'admin@simulator.uz',
            'password': 'admin123',
            'full_name': 'Tizim Administratori',
            'role': 'admin'
        },
        {
            'username': 'oqituvchi',
            'email': 'teacher@simulator.uz',
            'password': 'oqituvchi123',
            'full_name': 'Dotsent Bekzod Qodirov',
            'role': 'teacher'
        },
        {
            'username': 'talaba',
            'email': 'student@simulator.uz',
            'password': 'talaba123',
            'full_name': 'Akrom Xoliqov (Talaba)',
            'role': 'student'
        },
        {
            'username': 'mutaxassis',
            'email': 'specialist@simulator.uz',
            'password': 'mutaxassis123',
            'full_name': 'Sardor Aliyev (Tarmoq muhandisi)',
            'role': 'specialist'
        }
    ]

    for u in users_to_seed:
        existing = con.execute("SELECT id FROM users WHERE username=?", (u['username'],)).fetchone()
        if not existing:
            pw_hash, salt = hash_password(u['password'])
            cur = con.execute("""
                INSERT INTO users (username, email, password_hash, salt, full_name, role, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """, (u['username'], u['email'], pw_hash, salt, u['full_name'], u['role'], now, now))
            u_id = cur.lastrowid
        else:
            u_id = existing['id']
            # update role if needed
            con.execute("UPDATE users SET role=? WHERE id=?", (u['role'], u_id))

        # Tegishli profil jadvalini to'ldirish
        if u['role'] == 'student':
            con.execute("""
                INSERT OR IGNORE INTO student_profiles (user_id, student_id_number, group_name, faculty, enrollment_year, created_at)
                VALUES (?, 'STU-2023-9081', '412-21 TATU', 'Telekommunikatsiya texnologiyalari', 2023, ?)
            """, (u_id, now))
        elif u['role'] == 'teacher':
            con.execute("""
                INSERT OR IGNORE INTO teacher_profiles (user_id, department, academic_degree, specialization, office_room, created_at)
                VALUES (?, 'Kompyuter tarmoqlari va telekommunikatsiya', 'Dotsent / PhD', 'Tarmoq xavfsizligi va yuqori tezlikdagi protokollar', '304-xona', ?)
            """, (u_id, now))
        elif u['role'] == 'specialist':
            con.execute("""
                INSERT OR IGNORE INTO network_specialist_profiles (user_id, certifications, organization, experience_years, specialty_area, created_at)
                VALUES (?, 'CCNP Enterprise, CISSP, JNCIA-Cloud', 'Uztelecom NOC / Senior NetOps', 8, 'Magistral tarmoqlar unumdorligi va kiberxavfsizlik auditi', ?)
            """, (u_id, now))
        elif u['role'] == 'admin':
            con.execute("""
                INSERT OR IGNORE INTO admin_profiles (user_id, admin_level, managed_department, phone_contact, created_at)
                VALUES (?, 'SuperAdministrator', 'Axborot-kommunikatsiya texnologiyalari markazi', '+998 71 200-88-00', ?)
            """, (u_id, now))

    con.commit()

    # 4. Laboratories (Laboratoriya topshiriqlari shablonlari)
    teacher_id = con.execute("SELECT id FROM users WHERE username='oqituvchi'").fetchone()['id']
    student_id = con.execute("SELECT id FROM users WHERE username='talaba'").fetchone()['id']

    labs = [
        {
            'title': '1-Laboratoriya: HTTP vs HTTPS (TLS 1.2 va TLS 1.3) unumdorlik va xavfsizlik tahlili',
            'description': 'Shifrlanmagan HTTP/1.1 va zamonaviy TLS 1.3 protokollarining qo\'shimcha xarajatlari (RTT handshake, CPU yuki, overhead) va xavfsizlik darajasini tahlil qilish.',
            'category': 'Shifrlash va Xavfsizlik',
            'difficulty': 'Boshlang\'ich',
            'instructions': '1. Bandwidth 100 Mbit/s, Latency 35 ms qilib sozlang.\n2. Avval HTTP/1.1 protokolini, so\'ngra HTTPS/TLS 1.3 protokolini tanlab simulyatsiya qiling.\n3. Handshake vaqti va xavfsizlik reytingidagi farqni qayd eting.\n4. Natijalar hisobotini o\'qituvchiga yuboring.',
            'target_role': 'student',
            'default_params_json': json.dumps({'bandwidth': 100, 'latency': 35, 'loss': 0.2, 'load': 45, 'protocol': 'HTTPS/TLS 1.3', 'users': 150, 'jitter': 2.5, 'qos': 'none', 'mtu': 1500}),
            'expected_outcome': 'TLS 1.3 protokoli 1-RTT orqali tezkor ulanish va 88% xavfsizlik ko\'rsatkichini beradi, HTTP/1.1 esa ochiq paketlar xavfiga ega.'
        },
        {
            'title': '2-Laboratoriya: Tarmoq yuklamasi va Bufferbloat kechikish egri chizig\'i',
            'description': 'Kanal yuklamasi (rho -> 1) oshganda M/M/1 navbat nazariyasi asosida kechikishning eksponensial o\'sishini va buferbloat inqirozini modellashtirish.',
            'category': 'Kechikish va Navbat',
            'difficulty': 'O\'rta',
            'instructions': '1. Tarmoq yuklamasini ketma-ket 30%, 65%, 85% va 95% ga oshirib simulyatsiya qiling.\n2. Kechikish (Latency) va Bufferbloat indeksi qanday o\'zgarishini jadvalga yozing.\n3. FQ-CoDel yoki CAKE QoS intizomini yoqib natijani solishtiring.',
            'target_role': 'student',
            'default_params_json': json.dumps({'bandwidth': 50, 'latency': 40, 'loss': 1.0, 'load': 85, 'protocol': 'HTTPS/TLS 1.3', 'users': 300, 'jitter': 8.0, 'qos': 'codel', 'mtu': 1500}),
            'expected_outcome': 'Yuqori yuklamada FIFO bufer to\'lib kechikish 3-4 barobar oshadi. Smart Queue Management (SQM) kechikishni me\'yorda saqlaydi.'
        },
        {
            'title': '3-Laboratoriya: Korporativ VPN (WireGuard vs OpenVPN/IPsec) tunnellari taqqoslashi',
            'description': 'Klassik og\'ir OpenVPN/IPsec va zamonaviy yengil WireGuard protokollarining kriptografik sarlavha yuki va CPU resurs sarfini chuqur tekshirish.',
            'category': 'VPN va Maxfiylik',
            'difficulty': 'Yuqori',
            'instructions': '1. VPN stsenariysini tanlang.\n2. OpenVPN/IPsec da overhead 14% ekanligini, WireGuard da esa atigi 5% ekanligini Goodput formulasi orqali hisoblang.\n3. Mathis TCP chegarasini tekshiring.',
            'target_role': 'student',
            'default_params_json': json.dumps({'bandwidth': 200, 'latency': 25, 'loss': 0.1, 'load': 40, 'protocol': 'WireGuard', 'users': 250, 'jitter': 1.8, 'qos': 'none', 'mtu': 1500}),
            'expected_outcome': 'WireGuard 3 barobar kamroq kechikish va yuqori Goodput taqdim etadi.'
        },
        {
            'title': '4-Laboratoriya: QUIC (HTTP/3) 0-RTT va paket yo\'qolishiga chidamlilik',
            'description': 'UDP asosidagi QUIC protokoli TCP ning Head-of-line blokirovkasini qanday yengib o\'tishini paket yo\'qotilishi (Packet loss > 5%) sharoitida isbotlash.',
            'category': 'Zamonaviy Protokollar',
            'difficulty': 'O\'rta',
            'instructions': '1. Paket yo\'qotilishini 5.0% qilib belgilang.\n2. TCP asosidagi HTTPS/TLS 1.3 va HTTP/3 (QUIC) unumdorligini solishtiring.\n3. AI xulosalarini tahlil qiling.',
            'target_role': 'student',
            'default_params_json': json.dumps({'bandwidth': 100, 'latency': 50, 'loss': 5.0, 'load': 60, 'protocol': 'HTTP/3 (QUIC)', 'users': 180, 'jitter': 12.0, 'qos': 'voip', 'mtu': 1500}),
            'expected_outcome': 'QUIC ko\'p oqimli mustaqil ulanish orqali yuqori o\'tkazuvchanlikni saqlab qoladi.'
        }
    ]

    for lab in labs:
        existing = con.execute("SELECT id FROM laboratories WHERE title=?", (lab['title'],)).fetchone()
        if not existing:
            con.execute("""
                INSERT INTO laboratories (title, description, category, difficulty, instructions, target_role, default_params_json, expected_outcome, is_active, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """, (lab['title'], lab['description'], lab['category'], lab['difficulty'], lab['instructions'], lab['target_role'], lab['default_params_json'], lab['expected_outcome'], teacher_id, now))

    con.commit()

    # 5. Assignments (Topshiriqlar)
    lab_rows = con.execute("SELECT id, title FROM laboratories").fetchall()
    if lab_rows:
        lab1 = lab_rows[0]
        lab2 = lab_rows[1] if len(lab_rows) > 1 else lab1

        # Check existing assignments
        if not con.execute("SELECT 1 FROM assignments").fetchone():
            con.execute("""
                INSERT INTO assignments (lab_id, teacher_id, title, description, group_name, due_date, max_score, is_active, created_at)
                VALUES (?, ?, ?, ?, '412-21 TATU', '2026-11-15', 100, 1, ?)
            """, (lab1['id'], teacher_id, f"1-Topshiriq: {lab1['title']}", "Barcha talabalar ushbu simulyatsiyani bajarib, hisobotni tizim orqali yuklashlari shart.", now))

            con.execute("""
                INSERT INTO assignments (lab_id, teacher_id, title, description, group_name, due_date, max_score, is_active, created_at)
                VALUES (?, ?, ?, ?, '412-21 TATU', '2026-11-25', 100, 1, ?)
            """, (lab2['id'], teacher_id, f"2-Topshiriq: {lab2['title']}", "Bufferbloat va yuklama dinamikasi bo'yicha ilmiy xulosalaringizni yozing.", now))
            con.commit()

    # 6. Sample Lab Results for student
    asgn = con.execute("SELECT id, lab_id FROM assignments LIMIT 1").fetchone()
    if asgn and not con.execute("SELECT 1 FROM lab_results").fetchone():
        sample_metrics = {
            'latency': 39.2,
            'throughput': 94.5,
            'goodput': 90.2,
            'packet_loss': 0.22,
            'security_score': 88,
            'score': 89.5,
            'status': 'A\'lo'
        }
        con.execute("""
            INSERT INTO lab_results (assignment_id, lab_id, student_id, student_notes, submission_params_json, metrics_json, score, teacher_feedback, status, graded_by, graded_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            asgn['id'],
            asgn['lab_id'],
            student_id,
            "Simulyatsiya muvaffaqiyatli o'tkazildi. TLS 1.3 da 1-RTT handshake hisobiga kechikish 39.2 ms dan oshmadi. Xavfsizlik ko'rsatkichi 88 ball.",
            json.dumps({'bandwidth': 100, 'latency': 35, 'loss': 0.2, 'load': 45, 'protocol': 'HTTPS/TLS 1.3'}),
            json.dumps(sample_metrics),
            95,
            "Ajoyib natija! TLS 1.3 protokoli parametrlari to'g'ri tahlil qilingan.",
            'graded',
            teacher_id,
            now,
            now
        ))

        # Also seed a pending submission ready for teacher grading
        asgn2 = con.execute("SELECT id, lab_id FROM assignments WHERE id = 2").fetchone()
        if asgn2:
            con.execute("""
                INSERT INTO lab_results (assignment_id, lab_id, student_id, student_notes, submission_params_json, metrics_json, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)
            """, (
                asgn2['id'],
                asgn2['lab_id'],
                student_id,
                "Kanal yuklamasi 85% ga oshirilganda bufer navbatida kechikish 142 ms ga yetdi (Bufferbloat effekti kuzatildi).",
                json.dumps({'bandwidth': 100, 'latency': 35, 'loss': 1.2, 'load': 85, 'protocol': 'HTTP/2'}),
                json.dumps({'throughput': 62.4, 'latency': 142.1, 'goodput': 58.0, 'packet_loss': 1.35, 'security_score': 75}),
                now
            ))
        con.commit()

    # 7. System Settings
    settings_list = [
        ('site_title', 'Internet unumdorligi va xavfsizlik protokollarini baholash simulyatori', 'general', 'Platformaning to\'liq nomi'),
        ('system_version', '3.5.0 Enterprise', 'general', 'Tizim versiyasi'),
        ('allow_registration', 'true', 'auth', 'Ochiq ro\'yxatdan o\'tishga ruxsat berish'),
        ('default_role', 'student', 'auth', 'Yangi foydalanuvchilar uchun standart rol'),
        ('maintenance_mode', 'false', 'system', 'Tizimda profilaktika rejimi'),
        ('max_bandwidth_mbps', '10000', 'simulation', 'Simulyator maksimal o\'tkazuvchanligi'),
        ('default_language', 'uz', 'localization', 'Standart til (uz, ru, en)'),
        ('default_theme', 'vanilla', 'theme', 'Standart interfeys mavzusi'),
        ('audit_logging', 'true', 'security', 'Xavfsizlik va audit jurnallarini faol yuritish')
    ]
    for k, v, cat, desc in settings_list:
        con.execute("""
            INSERT OR IGNORE INTO system_settings (setting_key, setting_value, category, description, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (k, v, cat, desc, now))
    con.commit()

    # 8. Sample Audit Logs
    if not con.execute("SELECT 1 FROM audit_logs").fetchone():
        logs_to_seed = [
            (con.execute("SELECT id FROM users WHERE username='admin'").fetchone()['id'], 'admin', 'SYSTEM_INITIALIZE', 'SYSTEM', '1', 'Tizim 13 ta asosiy jadvallar va rollar bilan ishga tushirildi', '127.0.0.1', 'SUCCESS'),
            (con.execute("SELECT id FROM users WHERE username='oqituvchi'").fetchone()['id'], 'oqituvchi', 'CREATE_ASSIGNMENT', 'ASSIGNMENT', '1', '1-Topshiriq 412-21 TATU guruhi uchun e\'lon qilindi', '127.0.0.1', 'SUCCESS'),
            (con.execute("SELECT id FROM users WHERE username='talaba'").fetchone()['id'], 'talaba', 'SUBMIT_LAB', 'LAB_RESULT', '1', '1-Laboratoriya ishi bo\'yicha simulyatsiya hisoboti topshirildi', '127.0.0.1', 'SUCCESS'),
            (con.execute("SELECT id FROM users WHERE username='oqituvchi'").fetchone()['id'], 'oqituvchi', 'GRADE_LAB', 'LAB_RESULT', '1', 'Talaba Akrom Xoliqovning laboratoriya ishi 95 ball bilan baholandi', '127.0.0.1', 'SUCCESS')
        ]
        for uid, usr, act, etype, eid, det, ip, st in logs_to_seed:
            con.execute("""
                INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (uid, usr, act, etype, eid, det, ip, st, now))
        con.commit()

def log_audit_event(user_id, username, action, entity_type=None, entity_id=None, details=None, ip='127.0.0.1', user_agent=None, status='SUCCESS'):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with closing(get_db()) as con:
            con.execute("""
                INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address, user_agent, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, username, action, entity_type, str(entity_id) if entity_id else None, details, ip, user_agent, status, now))
            con.commit()
    except Exception as e:
        print(f"Audit log error: {e}")

if __name__ == '__main__':
    print("Database initializatsiya qilinmoqda...")
    init_full_database()
    print("✓ Ma'lumotlar bazasi 13 ta jadval bilan to'liq yaratildi!")
