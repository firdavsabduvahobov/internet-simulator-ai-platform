"""
API Handlers for Internet Performance & Security Simulator
Barcha rollar (Student, Teacher, Specialist, Admin) uchun to'liq biznes-mantiq va ma'lumotlar bazasi amallari.
"""
import os
import json
import sqlite3
from datetime import datetime
from database import (
    get_db,
    hash_password,
    verify_password,
    generate_token,
    verify_token,
    log_audit_event,
    DB_PATH
)

def get_auth_user_from_header(auth_header: str):
    """Bearer tokendan foydalanuvchini aniqlash va tekshirish"""
    if not auth_header:
        return None
    token = auth_header.replace("Bearer ", "").strip()
    payload = verify_token(token)
    if not payload:
        return None
    
    with get_db() as con:
        user = con.execute("SELECT id, username, email, full_name, role, status FROM users WHERE id=?", (payload['uid'],)).fetchone()
        if not user or user['status'] != 'active':
            return None
        return dict(user)

# -------------------------------------------------------------
# 1. AUTH HANDLERS
# -------------------------------------------------------------
def handle_login(data: dict, ip: str = '127.0.0.1', ua: str = None):
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', '')).strip()

    if not username or not password:
        return {'error': 'Foydalanuvchi nomi va parol kiritilishi shart'}, 400

    with get_db() as con:
        user = con.execute("SELECT * FROM users WHERE username=? OR email=?", (username, username)).fetchone()
        if not user:
            log_audit_event(None, username, 'AUTH_FAILED', 'USER', None, 'Foydalanuvchi topilmadi', ip, ua, 'FAILED')
            return {'error': 'Login yoki parol noto\'g\'ri'}, 401

        if user['status'] == 'blocked':
            log_audit_event(user['id'], user['username'], 'AUTH_BLOCKED', 'USER', str(user['id']), 'Bloklangan hisob kirishga urindi', ip, ua, 'BLOCKED')
            return {'error': 'Ushbu hisob administrator tomonidan bloklangan'}, 403

        if not verify_password(password, user['password_hash'], user['salt']):
            log_audit_event(user['id'], user['username'], 'AUTH_WRONG_PASSWORD', 'USER', str(user['id']), 'Noto\'g\'ri parol kiritildi', ip, ua, 'FAILED')
            return {'error': 'Login yoki parol noto\'g\'ri'}, 401

        # Muvaffaqiyatli kirish
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        con.execute("UPDATE users SET last_login=? WHERE id=?", (now, user['id']))
        con.commit()

        token = generate_token(user['id'], user['username'], user['role'])

        # Profil ma'lumotlarini olish
        profile = get_user_profile(con, user['id'], user['role'])

        # Permissions olish
        perms = [r['permission_key'] for r in con.execute("""
            SELECT p.permission_key FROM permissions p
            JOIN roles r ON r.id = p.role_id
            WHERE r.name = ?
        """, (user['role'],)).fetchall()]

        log_audit_event(user['id'], user['username'], 'USER_LOGIN', 'USER', str(user['id']), f"Tizimga kirish: {user['role']}", ip, ua, 'SUCCESS')

        return {
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name'],
                'role': user['role'],
                'status': user['status'],
                'profile': profile,
                'permissions': perms
            }
        }, 200

def handle_register(data: dict, ip: str = '127.0.0.1', ua: str = None):
    username = str(data.get('username', '')).strip().lower()
    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', '')).strip()
    full_name = str(data.get('full_name', '')).strip()
    role = str(data.get('role', 'student')).strip().lower()

    if not username or not password or not full_name:
        return {'error': 'Barcha majburiy maydonlarni to\'ldiring'}, 400

    if len(password) < 6:
        return {'error': 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'}, 400

    # Ruxsat etilgan rollar: o'z-o'zini ro'yxatdan o'tkazishda faqat student, teacher yoki specialist bo'lishi mumkin!
    # Admin huquqini hech qachon oddiy ro'yxatdan o'tuvchi tanlay olmaydi!
    if role not in ('student', 'specialist', 'teacher'):
        role = 'student'

    with get_db() as con:
        # Tizimda ro'yxatdan o'tish yoqilganmi?
        setting = con.execute("SELECT setting_value FROM system_settings WHERE setting_key='allow_registration'").fetchone()
        if setting and setting['setting_value'].lower() == 'false':
            return {'error': 'Tizimda yangi ro\'yxatdan o\'tish vaqtincha to\'xtatilgan'}, 403

        # Username / Email tekshirish
        existing = con.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        if existing:
            return {'error': 'Ushbu login band. Boshqa login tanlang'}, 400

        if email:
            existing_email = con.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if existing_email:
                return {'error': 'Ushbu email bilan foydalanuvchi allaqachon mavjud'}, 400

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        pw_hash, salt = hash_password(password)

        cur = con.execute("""
            INSERT INTO users (username, email, password_hash, salt, full_name, role, status, created_at, updated_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        """, (username, email or f"{username}@simulator.uz", pw_hash, salt, full_name, role, now, now, now))
        user_id = cur.lastrowid

        # Profil yaratish
        if role == 'student':
            group_name = data.get('group_name', '412-21 TATU')
            con.execute("""
                INSERT INTO student_profiles (user_id, student_id_number, group_name, faculty, enrollment_year, created_at)
                VALUES (?, ?, ?, 'Axborot texnologiyalari', 2024, ?)
            """, (user_id, f"STU-{user_id:04d}", group_name, now))
        elif role == 'teacher':
            dept = data.get('department', 'Telekommunikatsiya kafedrasi')
            con.execute("""
                INSERT INTO teacher_profiles (user_id, department, academic_degree, specialization, office_room, created_at)
                VALUES (?, ?, 'Katta o\'qituvchi', 'Tarmoq texnologiyalari', '201-xona', ?)
            """, (user_id, dept, now))
        elif role == 'specialist':
            org = data.get('organization', 'Mustaqil tarmoq muhandisi')
            con.execute("""
                INSERT INTO network_specialist_profiles (user_id, certifications, organization, experience_years, specialty_area, created_at)
                VALUES (?, 'CCNA, MTCNA', ?, 3, 'Tarmoq monitoringi va tahlil', ?)
            """, (user_id, org, now))

        con.commit()

        token = generate_token(user_id, username, role)
        profile = get_user_profile(con, user_id, role)

        log_audit_event(user_id, username, 'USER_REGISTER', 'USER', str(user_id), f"Yangi ro'yxatdan o'tish: rol={role}", ip, ua, 'SUCCESS')

        return {
            'token': token,
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'full_name': full_name,
                'role': role,
                'status': 'active',
                'profile': profile
            }
        }, 201

def handle_get_me(user: dict):
    with get_db() as con:
        profile = get_user_profile(con, user['id'], user['role'])
        perms = [r['permission_key'] for r in con.execute("""
            SELECT p.permission_key FROM permissions p
            JOIN roles r ON r.id = p.role_id
            WHERE r.name = ?
        """, (user['role'],)).fetchall()]

        return {
            'user': {
                **user,
                'profile': profile,
                'permissions': perms
            }
        }, 200

def get_user_profile(con, user_id: int, role: str) -> dict:
    profile_tables = {
        'student': ('student_profiles', 'STU'),
        'teacher': ('teacher_profiles', 'TEA'),
        'specialist': ('network_specialist_profiles', 'NET'),
        'admin': ('admin_profiles', 'ADM')
    }
    table_info = profile_tables.get(role)
    if not table_info:
        return {}
    tbl, _ = table_info
    row = con.execute(f"SELECT * FROM {tbl} WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else {}

# -------------------------------------------------------------
# 2. TALABA (STUDENT) HANDLERS
# -------------------------------------------------------------
def student_get_dashboard(user: dict):
    with get_db() as con:
        uid = user['id']
        total_labs = con.execute("SELECT count(*) FROM laboratories WHERE is_active=1").fetchone()[0]
        submitted_labs = con.execute("SELECT count(*) FROM lab_results WHERE student_id=?", (uid,)).fetchone()[0]
        graded_labs = con.execute("SELECT count(*) FROM lab_results WHERE student_id=? AND status='graded'", (uid,)).fetchone()[0]
        avg_score_row = con.execute("SELECT avg(score) FROM lab_results WHERE student_id=? AND status='graded'", (uid,)).fetchone()[0]
        avg_score = round(avg_score_row, 1) if avg_score_row else 0

        # Oxirgi simulyatsiyalar
        recent_sims = [dict(r) for r in con.execute("""
            SELECT id, session_name, protocol, bandwidth, latency, score, status, created_at
            FROM simulation_sessions WHERE user_id=? ORDER BY id DESC LIMIT 5
        """, (uid,)).fetchall()]

        # Biriktirilgan topshiriqlar
        assignments = [dict(r) for r in con.execute("""
            SELECT a.id, a.title, a.due_date, a.max_score, l.difficulty, l.category,
                   (SELECT status FROM lab_results lr WHERE lr.assignment_id=a.id AND lr.student_id=?) as submission_status,
                   (SELECT score FROM lab_results lr WHERE lr.assignment_id=a.id AND lr.student_id=?) as grade
            FROM assignments a
            JOIN laboratories l ON l.id = a.lab_id
            WHERE a.is_active=1
            ORDER BY a.id DESC LIMIT 6
        """, (uid, uid)).fetchall()]

        return {
            'stats': {
                'total_labs': total_labs,
                'submitted_labs': submitted_labs,
                'graded_labs': graded_labs,
                'average_score': avg_score
            },
            'recent_simulations': recent_sims,
            'assignments': assignments
        }, 200

def student_get_laboratories():
    with get_db() as con:
        rows = con.execute("""
            SELECT id, title, description, category, difficulty, instructions, default_params_json, expected_outcome
            FROM laboratories WHERE is_active=1 ORDER BY id ASC
        """).fetchall()
        labs = []
        for r in rows:
            d = dict(r)
            try:
                d['default_params'] = json.loads(r['default_params_json'])
            except Exception:
                d['default_params'] = {}
            labs.append(d)
        return labs, 200

def student_submit_lab(user: dict, data: dict, ip: str = '127.0.0.1', ua: str = None):
    lab_id = int(data.get('lab_id', 1))
    assignment_id = data.get('assignment_id')
    student_notes = str(data.get('student_notes', '')).strip()
    submission_params = data.get('params', {})
    metrics = data.get('metrics', {})
    simulation_id = data.get('simulation_id')

    if not student_notes:
        return {'error': 'Laboratoriya xulosasi va hisobot matnini kiritishingiz shart'}, 400

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as con:
        cur = con.execute("""
            INSERT INTO lab_results (
                assignment_id, lab_id, student_id, simulation_id,
                student_notes, submission_params_json, metrics_json,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
        """, (
            assignment_id,
            lab_id,
            user['id'],
            simulation_id,
            student_notes,
            json.dumps(submission_params),
            json.dumps(metrics),
            now
        ))
        result_id = cur.lastrowid
        con.commit()

        log_audit_event(user['id'], user['username'], 'SUBMIT_LAB', 'LAB_RESULT', str(result_id), f"Lab #{lab_id} hisoboti topshirildi", ip, ua, 'SUCCESS')

        return {'status': 'submitted', 'id': result_id, 'message': 'Hisobot muvaffaqiyatli topshirildi va tekshirishga yuborildi'}, 201

def student_get_my_results(user: dict):
    with get_db() as con:
        rows = con.execute("""
            SELECT lr.id, lr.lab_id, lr.assignment_id, lr.score, lr.status, lr.student_notes,
                   lr.teacher_feedback, lr.graded_at, lr.created_at,
                   l.title as lab_title, l.category as lab_category,
                   u.full_name as teacher_name
            FROM lab_results lr
            JOIN laboratories l ON l.id = lr.lab_id
            LEFT JOIN users u ON u.id = lr.graded_by
            WHERE lr.student_id = ?
            ORDER BY lr.id DESC
        """, (user['id'],)).fetchall()

        results = [dict(r) for r in rows]
        return results, 200

# -------------------------------------------------------------
# 3. O'QITUVCHI (TEACHER) HANDLERS
# -------------------------------------------------------------
def teacher_get_dashboard(user: dict):
    with get_db() as con:
        total_students = con.execute("SELECT count(*) FROM users WHERE role='student'").fetchone()[0]
        total_groups = con.execute("SELECT count(DISTINCT group_name) FROM student_profiles").fetchone()[0] or 1
        pending_submissions = con.execute("SELECT count(*) FROM lab_results WHERE status='submitted'").fetchone()[0]
        graded_submissions = con.execute("SELECT count(*) FROM lab_results WHERE status='graded'").fetchone()[0]

        recent_submissions = [dict(r) for r in con.execute("""
            SELECT lr.id, lr.created_at, lr.status, lr.score,
                   u.full_name as student_name, sp.group_name,
                   l.title as lab_title
            FROM lab_results lr
            JOIN users u ON u.id = lr.student_id
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            JOIN laboratories l ON l.id = lr.lab_id
            ORDER BY lr.id DESC LIMIT 8
        """).fetchall()]

        return {
            'stats': {
                'total_students': total_students,
                'total_groups': total_groups,
                'pending_submissions': pending_submissions,
                'graded_submissions': graded_submissions
            },
            'recent_submissions': recent_submissions
        }, 200

def teacher_get_students():
    with get_db() as con:
        rows = con.execute("""
            SELECT u.id, u.username, u.full_name, u.email, u.status, u.created_at,
                   sp.group_name, sp.faculty, sp.student_id_number,
                   (SELECT count(*) FROM lab_results lr WHERE lr.student_id=u.id) as submissions_count,
                   (SELECT avg(score) FROM lab_results lr WHERE lr.student_id=u.id AND lr.status='graded') as avg_score
            FROM users u
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE u.role='student'
            ORDER BY sp.group_name ASC, u.full_name ASC
        """).fetchall()

        students = []
        for r in rows:
            d = dict(r)
            d['avg_score'] = round(d['avg_score'], 1) if d['avg_score'] else 0
            students.append(d)
        return students, 200

def teacher_get_groups():
    with get_db() as con:
        rows = con.execute("""
            SELECT sp.group_name, count(u.id) as student_count,
                   avg((SELECT avg(lr.score) FROM lab_results lr WHERE lr.student_id=u.id AND lr.status='graded')) as group_avg_score
            FROM student_profiles sp
            JOIN users u ON u.id = sp.user_id
            WHERE u.status='active'
            GROUP BY sp.group_name
        """).fetchall()

        groups = []
        for r in rows:
            groups.append({
                'group_name': r['group_name'] or '412-21 TATU',
                'student_count': r['student_count'],
                'group_avg_score': round(r['group_avg_score'], 1) if r['group_avg_score'] else 0
            })
        return groups, 200

def teacher_get_assignments():
    with get_db() as con:
        rows = con.execute("""
            SELECT a.id, a.title, a.description, a.group_name, a.due_date, a.max_score, a.is_active, a.created_at,
                   l.title as lab_title, l.id as lab_id,
                   u.full_name as teacher_name,
                   (SELECT count(*) FROM lab_results lr WHERE lr.assignment_id=a.id) as submissions_count
            FROM assignments a
            JOIN laboratories l ON l.id = a.lab_id
            LEFT JOIN users u ON u.id = a.teacher_id
            ORDER BY a.id DESC
        """).fetchall()
        return [dict(r) for r in rows], 200

def teacher_create_assignment(user: dict, data: dict, ip: str = '127.0.0.1', ua: str = None):
    lab_id = int(data.get('lab_id', 1))
    title = str(data.get('title', '')).strip()
    description = str(data.get('description', '')).strip()
    group_name = str(data.get('group_name', 'Barcha guruhlar')).strip()
    due_date = str(data.get('due_date', '')).strip()
    max_score = int(data.get('max_score', 100))

    if not title:
        return {'error': 'Topshiriq sarlavhasini kiritish shart'}, 400

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as con:
        cur = con.execute("""
            INSERT INTO assignments (lab_id, teacher_id, title, description, group_name, due_date, max_score, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (lab_id, user['id'], title, description, group_name, due_date, max_score, now))
        asgn_id = cur.lastrowid
        con.commit()

        log_audit_event(user['id'], user['username'], 'CREATE_ASSIGNMENT', 'ASSIGNMENT', str(asgn_id), f"Topshiriq e'lon qilindi: {title}", ip, ua, 'SUCCESS')
        return {'status': 'created', 'id': asgn_id, 'message': 'Topshiriq muvaffaqiyatli yaratildi'}, 201

def teacher_get_submissions(status: str = 'all'):
    with get_db() as con:
        sql = """
            SELECT lr.id, lr.student_id, lr.assignment_id, lr.lab_id, lr.score, lr.status,
                   lr.student_notes, lr.teacher_feedback, lr.submission_params_json, lr.metrics_json,
                   lr.created_at, lr.graded_at,
                   u.full_name as student_name, u.username as student_username,
                   sp.group_name,
                   l.title as lab_title
            FROM lab_results lr
            JOIN users u ON u.id = lr.student_id
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            JOIN laboratories l ON l.id = lr.lab_id
        """
        params = []
        if status != 'all':
            sql += " WHERE lr.status = ?"
            params.append(status)
        sql += " ORDER BY lr.id DESC"

        rows = con.execute(sql, tuple(params)).fetchall()
        submissions = []
        for r in rows:
            d = dict(r)
            try:
                d['params'] = json.loads(r['submission_params_json']) if r['submission_params_json'] else {}
            except Exception:
                d['params'] = {}
            try:
                d['metrics'] = json.loads(r['metrics_json']) if r['metrics_json'] else {}
            except Exception:
                d['metrics'] = {}
            submissions.append(d)
        return submissions, 200

def teacher_grade_submission(user: dict, sub_id: int, data: dict, ip: str = '127.0.0.1', ua: str = None):
    score = float(data.get('score', 0))
    feedback = str(data.get('feedback', '')).strip()

    if score < 0 or score > 100:
        return {'error': 'Ball 0 dan 100 gacha bo\'lishi shart'}, 400

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as con:
        con.execute("""
            UPDATE lab_results
            SET score=?, teacher_feedback=?, status='graded', graded_by=?, graded_at=?
            WHERE id=?
        """, (score, feedback, user['id'], now, sub_id))
        con.commit()

        log_audit_event(user['id'], user['username'], 'GRADE_LAB', 'LAB_RESULT', str(sub_id), f"Natija baholandi: {score} ball", ip, ua, 'SUCCESS')
        return {'status': 'graded', 'score': score, 'message': 'Natija muvaffaqiyatli baholandi'}, 200

# -------------------------------------------------------------
# 4. TARMOQ MUTAXASSISI (SPECIALIST) HANDLERS
# -------------------------------------------------------------
def specialist_get_dashboard():
    from main import PROTOCOLS
    return {
        'total_protocols': len(PROTOCOLS),
        'supported_standards': ['TLS 1.3 (RFC 8446)', 'QUIC / HTTP/3 (RFC 9000)', 'WireGuard', 'IPsec (RFC 4301)', 'SSH-2 (RFC 4253)', 'WebSocket (RFC 6455)'],
        'diagnostic_engine': 'M/M/1 Queuing + Mathis TCP + BDP Bufferbloat Engine',
        'metrics_available': ['Throughput', 'Goodput', 'Latency (RTT)', 'Packet Loss', 'Jitter', 'Mathis Limit', 'BDP Buffer (KB)', 'Bufferbloat Index', 'Cryptographic Overhead']
    }, 200

def specialist_deep_diagnostics(params: dict):
    from main import simulate_physics, PROTOCOLS
    bw = float(params.get('bandwidth', 100))
    lat = float(params.get('latency', 35))
    loss = float(params.get('loss', params.get('packet_loss', 0.5)))
    load = float(params.get('load', params.get('network_load', 50)))
    proto = params.get('protocol', 'HTTPS/TLS 1.3')
    jitter = float(params.get('jitter', 3.0))
    users = float(params.get('users', 150))
    qos = params.get('qos', 'none')
    mtu = int(params.get('mtu', 1500) or 1500)

    sim = simulate_physics(bw, lat, loss, load, proto, jitter, users, qos, mtu)

    # Qo'shimcha chuqur ilmiy ko'rsatkichlar:
    # 1. Mathis TCP chegarasi
    mss = max(500, mtu - 40)
    rtt_sec = max(0.001, sim['latency_ms'] / 1000.0)
    mathis_throughput = (1.22 * mss * 8.0) / (rtt_sec * ((loss / 100.0) ** 0.5 if loss > 0.001 else 0.01)) / 1e6
    mathis_throughput = min(bw, mathis_throughput)

    # 2. Bandwidth-Delay Product (BDP)
    bdp_bytes = (bw * 1e6 / 8.0) * rtt_sec
    bdp_kb = bdp_bytes / 1024.0

    # 3. Queuing delay M/M/1
    rho = min(0.99, max(0.01, (load / 100.0) + (users / 5000.0)))
    mm1_delay_ms = lat * (rho / (1.0 - rho))

    # 4. Kriptografik Goodput yo'qotilishi
    crypto_loss_mbps = sim['throughput_mbps'] - sim['goodput_mbps']

    return {
        'simulation': sim,
        'deep_metrics': {
            'mathis_throughput_limit_mbps': round(mathis_throughput, 2),
            'bdp_bytes': int(bdp_bytes),
            'bdp_kb': round(bdp_kb, 1),
            'bdp_optimal_socket_buffer': f"{int(bdp_kb * 1.5)} KB",
            'rho_utilization': round(rho, 3),
            'mm1_queuing_delay_ms': round(mm1_delay_ms, 2),
            'crypto_overhead_waste_mbps': round(crypto_loss_mbps, 2),
            'mtu_efficiency_pct': round((mss / mtu) * 100, 1),
            'rfc_compliance': {
                'protocol': proto,
                'standard': PROTOCOLS.get(proto, {}).get('desc', 'Standard specification'),
                'security_rating': PROTOCOLS.get(proto, {}).get('secScore', 0)
            }
        }
    }, 200

# -------------------------------------------------------------
# 5. ADMINISTRATOR (ADMIN) HANDLERS — /admin
# -------------------------------------------------------------
def admin_get_dashboard():
    with get_db() as con:
        total_users = con.execute("SELECT count(*) FROM users").fetchone()[0]
        users_by_role = {r['role']: r['cnt'] for r in con.execute("SELECT role, count(*) as cnt FROM users GROUP BY role").fetchall()}
        total_labs = con.execute("SELECT count(*) FROM laboratories").fetchone()[0]
        total_assignments = con.execute("SELECT count(*) FROM assignments").fetchone()[0]
        total_submissions = con.execute("SELECT count(*) FROM lab_results").fetchone()[0]
        total_sims = con.execute("SELECT count(*) FROM simulations").fetchone()[0]
        total_sessions = con.execute("SELECT count(*) FROM simulation_sessions").fetchone()[0]
        total_logs = con.execute("SELECT count(*) FROM audit_logs").fetchone()[0]

        # SQLite hajmi
        db_size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
        db_size_kb = round(db_size_bytes / 1024, 1)

        recent_logs = [dict(r) for r in con.execute("""
            SELECT id, username, action, entity_type, ip_address, status, created_at, details
            FROM audit_logs ORDER BY id DESC LIMIT 10
        """).fetchall()]

        return {
            'stats': {
                'total_users': total_users,
                'users_by_role': users_by_role,
                'total_labs': total_labs,
                'total_assignments': total_assignments,
                'total_submissions': total_submissions,
                'total_simulations': total_sims + total_sessions,
                'total_logs': total_logs,
                'db_size_kb': db_size_kb
            },
            'recent_logs': recent_logs
        }, 200

def admin_get_users(role: str = 'all', status: str = 'all', query: str = ''):
    with get_db() as con:
        sql = "SELECT id, username, email, full_name, role, status, created_at, last_login FROM users WHERE 1=1"
        args = []
        if role != 'all':
            sql += " AND role = ?"
            args.append(role)
        if status != 'all':
            sql += " AND status = ?"
            args.append(status)
        if query:
            sql += " AND (username LIKE ? OR full_name LIKE ? OR email LIKE ?)"
            q_like = f"%{query}%"
            args.extend([q_like, q_like, q_like])
        sql += " ORDER BY id DESC"

        rows = con.execute(sql, tuple(args)).fetchall()
        users = []
        for r in rows:
            u = dict(r)
            u['profile'] = get_user_profile(con, u['id'], u['role'])
            users.append(u)
        return users, 200

def admin_create_user(admin_user: dict, data: dict, ip: str = '127.0.0.1', ua: str = None):
    username = str(data.get('username', '')).strip().lower()
    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', '')).strip()
    full_name = str(data.get('full_name', '')).strip()
    role = str(data.get('role', 'student')).strip().lower()

    if not username or not password or not full_name:
        return {'error': 'Username, parol va to\'liq ism kiritilishi shart'}, 400

    if role not in ('student', 'teacher', 'specialist', 'admin'):
        return {'error': 'Noto\'g\'ri rol tanlandi'}, 400

    with get_db() as con:
        existing = con.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        if existing:
            return {'error': 'Ushbu username band'}, 400

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        pw_hash, salt = hash_password(password)

        cur = con.execute("""
            INSERT INTO users (username, email, password_hash, salt, full_name, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        """, (username, email or f"{username}@simulator.uz", pw_hash, salt, full_name, role, now, now))
        new_id = cur.lastrowid

        # Profile yaratish
        if role == 'student':
            con.execute("INSERT INTO student_profiles (user_id, student_id_number, group_name, created_at) VALUES (?, ?, ?, ?)",
                        (new_id, f"STU-{new_id:04d}", data.get('group_name', '412-21 TATU'), now))
        elif role == 'teacher':
            con.execute("INSERT INTO teacher_profiles (user_id, department, academic_degree, created_at) VALUES (?, ?, ?, ?)",
                        (new_id, data.get('department', 'Kompyuter tarmoqlari'), data.get('degree', 'O\'qituvchi'), now))
        elif role == 'specialist':
            con.execute("INSERT INTO network_specialist_profiles (user_id, organization, specialty_area, created_at) VALUES (?, ?, ?, ?)",
                        (new_id, data.get('organization', 'NOC Markazi'), data.get('specialty_area', 'Tarmoq xavfsizligi'), now))
        elif role == 'admin':
            con.execute("INSERT INTO admin_profiles (user_id, admin_level, created_at) VALUES (?, 'Administrator', ?)",
                        (new_id, now))

        con.commit()

        log_audit_event(admin_user['id'], admin_user['username'], 'ADMIN_CREATE_USER', 'USER', str(new_id), f"Yangi foydalanuvchi yaratildi: {username} ({role})", ip, ua, 'SUCCESS')
        return {'status': 'created', 'id': new_id, 'message': f"Foydalanuvchi {username} muvaffaqiyatli yaratildi"}, 201

def admin_update_user(admin_user: dict, user_id: int, data: dict, ip: str = '127.0.0.1', ua: str = None):
    full_name = data.get('full_name')
    email = data.get('email')
    role = data.get('role')
    status = data.get('status')

    with get_db() as con:
        user = con.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            return {'error': 'Foydalanuvchi topilmadi'}, 404

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        con.execute("""
            UPDATE users SET full_name=?, email=?, role=?, status=?, updated_at=? WHERE id=?
        """, (
            full_name or user['full_name'],
            email or user['email'],
            role or user['role'],
            status or user['status'],
            now,
            user_id
        ))
        con.commit()

        log_audit_event(admin_user['id'], admin_user['username'], 'ADMIN_UPDATE_USER', 'USER', str(user_id), f"Foydalanuvchi ma'lumotlari tahrirlandi: {user['username']}", ip, ua, 'SUCCESS')
        return {'status': 'updated', 'message': 'Foydalanuvchi muvaffaqiyatli yangilandi'}, 200

def admin_toggle_user_status(admin_user: dict, user_id: int, ip: str = '127.0.0.1', ua: str = None):
    if user_id == admin_user['id']:
        return {'error': 'O\'z hisobingizni bloklay olmaysiz'}, 400

    with get_db() as con:
        user = con.execute("SELECT status, username FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            return {'error': 'Foydalanuvchi topilmadi'}, 404

        new_status = 'blocked' if user['status'] == 'active' else 'active'
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        con.execute("UPDATE users SET status=?, updated_at=? WHERE id=?", (new_status, now, user_id))
        con.commit()

        log_audit_event(admin_user['id'], admin_user['username'], 'ADMIN_TOGGLE_USER_STATUS', 'USER', str(user_id), f"Holat o'zgardi: {user['username']} -> {new_status}", ip, ua, 'SUCCESS')
        return {'status': new_status, 'message': f"Foydalanuvchi holati '{new_status}' ga o'zgartirildi"}, 200

def admin_reset_password(admin_user: dict, user_id: int, data: dict, ip: str = '127.0.0.1', ua: str = None):
    new_password = str(data.get('new_password', '')).strip()
    if len(new_password) < 6:
        return {'error': 'Yangi parol kamida 6 ta belgidan iborat bo\'lishi kerak'}, 400

    pw_hash, salt = hash_password(new_password)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as con:
        user = con.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            return {'error': 'Foydalanuvchi topilmadi'}, 404

        con.execute("UPDATE users SET password_hash=?, salt=?, updated_at=? WHERE id=?", (pw_hash, salt, now, user_id))
        con.commit()

        log_audit_event(admin_user['id'], admin_user['username'], 'ADMIN_RESET_PASSWORD', 'USER', str(user_id), f"Parol tiklandi: {user['username']}", ip, ua, 'SUCCESS')
        return {'status': 'ok', 'message': f"{user['username']} uchun yangi parol o'rnatildi"}, 200

def admin_delete_user(admin_user: dict, user_id: int, ip: str = '127.0.0.1', ua: str = None):
    if user_id == admin_user['id']:
        return {'error': 'Administrator o\'zini o\'zi o\'chira olmaydi'}, 400

    with get_db() as con:
        user = con.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            return {'error': 'Foydalanuvchi topilmadi'}, 404

        con.execute("DELETE FROM users WHERE id=?", (user_id,))
        con.commit()

        log_audit_event(admin_user['id'], admin_user['username'], 'ADMIN_DELETE_USER', 'USER', str(user_id), f"Foydalanuvchi o'chirildi: {user['username']}", ip, ua, 'SUCCESS')
        return {'status': 'deleted', 'message': f"Foydalanuvchi {user['username']} tizimdan butunlay o'chirildi"}, 200

def admin_get_roles():
    with get_db() as con:
        roles = [dict(r) for r in con.execute("SELECT * FROM roles ORDER BY id ASC").fetchall()]
        for r in roles:
            r['permissions'] = [dict(p) for p in con.execute("SELECT id, permission_key, description FROM permissions WHERE role_id=?", (r['id'],)).fetchall()]
        return roles, 200

def admin_get_audit_logs(limit: int = 50, action: str = 'all'):
    with get_db() as con:
        sql = "SELECT * FROM audit_logs"
        args = []
        if action != 'all':
            sql += " WHERE action = ?"
            args.append(action)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(limit)

        rows = con.execute(sql, tuple(args)).fetchall()
        return [dict(r) for r in rows], 200

def admin_get_db_info():
    with get_db() as con:
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
        table_stats = []
        for t in sorted(tables):
            cnt = con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            table_stats.append({'name': t, 'count': cnt})

        db_size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

        return {
            'database_path': str(DB_PATH),
            'database_size_bytes': db_size_bytes,
            'database_size_kb': round(db_size_bytes / 1024, 2),
            'database_size_mb': round(db_size_bytes / (1024 * 1024), 2),
            'tables_count': len(tables),
            'tables': table_stats,
            'sqlite_version': sqlite3.sqlite_version
        }, 200

def admin_database_vacuum(admin_user: dict, ip: str = '127.0.0.1', ua: str = None):
    with get_db() as con:
        con.execute("VACUUM")
    log_audit_event(admin_user['id'], admin_user['username'], 'DATABASE_VACUUM', 'DATABASE', None, "Ma'lumotlar bazasi optimallashtirildi (VACUUM)", ip, ua, 'SUCCESS')
    return {'status': 'ok', 'message': "Ma'lumotlar bazasi muvaffaqiyatli defragmentatsiya qilindi"}, 200

def admin_database_backup(admin_user: dict, ip: str = '127.0.0.1', ua: str = None):
    with get_db() as con:
        dump = {}
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
        for t in tables:
            rows = con.execute(f"SELECT * FROM {t}").fetchall()
            dump[t] = [dict(r) for r in rows]

    log_audit_event(admin_user['id'], admin_user['username'], 'DATABASE_BACKUP', 'DATABASE', None, f"Zaxira nusxasi yaratildi ({len(tables)} ta jadval)", ip, ua, 'SUCCESS')
    return {
        'timestamp': datetime.now().isoformat(),
        'tables_count': len(tables),
        'dump': dump
    }, 200

def admin_get_settings():
    with get_db() as con:
        rows = con.execute("SELECT * FROM system_settings ORDER BY category, id").fetchall()
        return [dict(r) for r in rows], 200

def admin_save_settings(admin_user: dict, data: dict, ip: str = '127.0.0.1', ua: str = None):
    settings = data.get('settings', {})
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as con:
        for k, v in settings.items():
            con.execute("""
                UPDATE system_settings SET setting_value=?, updated_by=?, updated_at=?
                WHERE setting_key=?
            """, (str(v), admin_user['id'], now, k))
        con.commit()

    log_audit_event(admin_user['id'], admin_user['username'], 'SETTINGS_UPDATE', 'SETTINGS', None, f"{len(settings)} ta tizim parametri yangilandi", ip, ua, 'SUCCESS')
    return {'status': 'ok', 'message': 'Tizim sozlamalari muvaffaqiyatli saqlandi'}, 200
