/* ==========================================================================
   AI Network Simulator — Professional Enterprise Platform Engine
   Talaba, O'qituvchi, Tarmoq Mutaxassisi va Administrator (RBAC, Multi-Role, I18N)
   ========================================================================== */

/* ---------- 1. KONFIGURATSIYA VA RBAC HOLATI ---------- */
const CONFIG = JSON.parse(localStorage.getItem('ans_cfg') || '{"useBackend":true,"apiBase":"http://localhost:8080"}');
const KEY = 'ans_history_v2';

let CURRENT_USER = null;
let AUTH_TOKEN = localStorage.getItem('ans_token') || null;
let CURRENT_LANG = localStorage.getItem('ans_lang') || 'uz';
let LAST_SIMULATION_RESULT = null;
let LAST_SIMULATION_PARAMS = null;

// Protokollar ma'lumotlar modeli
const PROTO = {
  'HTTPS/TLS 1.3': { sec:'Yuqori',      lat:"O'rta",      ovh:"O'rta",      perf:"Yuqori",      latAdd:4,   ovhPct:4.5,  secScore:88, rtts:1.0, cpu:0.8, desc:'Zamonaviy TLS 1.3 shifrlash va 1-RTT handshake' },
  'HTTP/3 (QUIC)': { sec:'Juda Yuqori', lat:'Juda Past',  ovh:'Past',       perf:'Juda Yuqori', latAdd:2,   ovhPct:3.0,  secScore:95, rtts:0.5, cpu:0.5, desc:'UDP asosidagi 0-RTT va ko\'p oqimli multipleksing' },
  'WireGuard':     { sec:'Juda Yuqori', lat:'Past',       ovh:'Past',       perf:'Juda Yuqori', latAdd:5,   ovhPct:5.0,  secScore:96, rtts:1.0, cpu:0.4, desc:'Zamonaviy yadro darajasidagi yengil VPN' },
  'OpenVPN/IPSec': { sec:'Yuqori',      lat:'Yuqori',     ovh:'Yuqori',     perf:'O\'rta',      latAdd:18,  ovhPct:14.0, secScore:90, rtts:3.0, cpu:2.2, desc:'Klassik og\'ir korporativ IKEv2 shifrlangan tunnel' },
  'SSH':           { sec:'Yuqori',      lat:"O'rta",      ovh:"O'rta",      perf:"Yuqori",      latAdd:7,   ovhPct:6.0,  secScore:85, rtts:3.0, cpu:1.2, desc:'Xavfsiz terminal va SSH tunnellash' },
  'WebSocket':     { sec:"O'rta",       lat:'Past',       ovh:'Past',       perf:'Yuqori',      latAdd:2.5, ovhPct:2.5,  secScore:70, rtts:1.0, cpu:0.3, desc:'Doimiy ikki tomonlama real-vaqt aloqasi' },
  'HTTP/1.1':      { sec:'Past',        lat:'Past',       ovh:'Past',       perf:'O\'rta',      latAdd:1,   ovhPct:2.0,  secScore:15, rtts:2.0, cpu:0.1, desc:'Shifrlanmagan ochiq trafik, MITM xavfi' },
  'NONE':          { sec:'Yo\'q',       lat:'Juda Past',  ovh:'Nol',        perf:'Maksimal',    latAdd:0,   ovhPct:0.0,  secScore:0,  rtts:1.0, cpu:0.0, desc:'Himoyasiz ochiq paketlar (etalon taqqoslash)' }
};

const FIELDS = [
  { id:'bandwidth', label:'Bandwidth — Tarmoq tezligi', unit:'Mbit/s', min:1, max:1000, step:1,   val:100, slider:true },
  { id:'latency',   label:'Latency — Kechikish',        unit:'ms',     min:1, max:500,  step:1,   val:35,  slider:true },
  { id:'loss',      label:"Packet Loss — Yo'qotish",    unit:'%',      min:0, max:25,   step:0.1, val:0.6, slider:true },
  { id:'jitter',    label:'Jitter — Tebranish',         unit:'ms',     min:0, max:100,  step:0.5, val:3.0, slider:true },
  { id:'load',      label:'Network Load — Yuklama',     unit:'%',      min:0, max:100,  step:1,   val:55,  slider:true },
  { id:'users',     label:'Foydalanuvchilar soni',      unit:'ta',     min:1, max:10000, step:1,  val:200, slider:false }
];

const PRESETS = [
  { id: 'office',    name: '🏢 Standart Ofis',        desc: 'Korxona ichki tarmog\'i, barqaror ish', params: { bandwidth: 100, latency: 20, loss: 0.2, jitter: 2.5, load: 45, users: 150, protocol: 'HTTPS/TLS 1.3', mtu: '1500', qos: 'voip' } },
  { id: 'ddos',      name: '💥 DDoS / Trafik Bo\'roni', desc: 'Haddan tashqari yuklama va yo\'qotish', params: { bandwidth: 1000, latency: 195, loss: 14.5, jitter: 48, load: 97, users: 5500, protocol: 'HTTP/1.1', mtu: '1500', qos: 'none' } },
  { id: 'gaming',    name: '🎮 Onlayn Gaming / Esport', desc: 'Ultra-past latency va minimal jitter', params: { bandwidth: 50, latency: 12, loss: 0.02, jitter: 1.2, load: 22, users: 4, protocol: 'HTTP/3 (QUIC)', mtu: '1500', qos: 'voip' } },
  { id: 'streaming', name: '📺 4K UHD Striming',       desc: 'Katta o\'tkazuvchanlik va Jumbo paketlar', params: { bandwidth: 300, latency: 28, loss: 0.1, jitter: 3.5, load: 68, users: 45, protocol: 'HTTP/3 (QUIC)', mtu: '9000', qos: 'codel' } },
  { id: 'mobile',    name: '📱 Zaif Mobil Tarmoq',     desc: 'Chekka hudud, 3G/Zaif LTE signali', params: { bandwidth: 15, latency: 115, loss: 4.8, jitter: 32, load: 82, users: 12, protocol: 'HTTPS/TLS 1.3', mtu: '576', qos: 'none' } },
  { id: 'bank',      name: '🔒 Xavfsiz Bank Tizimi',   desc: 'Maksimal shifrlash va 0% paket yo\'qotish', params: { bandwidth: 200, latency: 24, loss: 0.0, jitter: 1.8, load: 40, users: 300, protocol: 'WireGuard', mtu: '1500', qos: 'codel' } }
];

/* ---------- 2. MULTILINGUAL (I18N) TIZIMI ---------- */
const PRESET_I18N = {
  office: {
    uz: { name: '🏢 Standart Ofis', desc: 'Korxona ichki tarmog\'i, barqaror ish' },
    ru: { name: '🏢 Стандартный Офис', desc: 'Корпоративная сеть предприятия, стабильный трафик' },
    en: { name: '🏢 Standard Office', desc: 'Enterprise local network, stable throughput' }
  },
  ddos: {
    uz: { name: '💥 DDoS / Trafik Bo\'roni', desc: 'Haddan tashqari yuklama va yo\'qotish' },
    ru: { name: '💥 DDoS / Шторм Трафика', desc: 'Экстремальная нагрузка и потеря пакетов' },
    en: { name: '💥 DDoS / Traffic Storm', desc: 'Extreme network load and packet loss' }
  },
  gaming: {
    uz: { name: '🎮 Onlayn Gaming / Esport', desc: 'Ultra-past latency va minimal jitter' },
    ru: { name: '🎮 Онлайн Гейминг / Киберспорт', desc: 'Ультранизкая задержка и минимальный джиттер' },
    en: { name: '🎮 Online Gaming / Esports', desc: 'Ultra-low latency and minimal jitter' }
  },
  streaming: {
    uz: { name: '📺 4K UHD Striming', desc: 'Katta o\'tkazuvchanlik va Jumbo paketlar' },
    ru: { name: '📺 4K UHD Стриминг', desc: 'Высокая пропускная способность и Jumbo фреймы' },
    en: { name: '📺 4K UHD Streaming', desc: 'High bandwidth pipeline and Jumbo frames' }
  },
  mobile: {
    uz: { name: '📱 Zaif Mobil Tarmoq', desc: 'Chekka hudud, 3G/Zaif LTE signali' },
    ru: { name: '📱 Нестабильная Мобильная Сеть', desc: 'Удаленный район, слабый сигнал 3G/LTE' },
    en: { name: '📱 Unstable Mobile Network', desc: 'Remote area, weak 3G/LTE wireless signal' }
  },
  bank: {
    uz: { name: '🔒 Xavfsiz Bank Tizimi', desc: 'Maksimal shifrlash va 0% paket yo\'qotish' },
    ru: { name: '🔒 Защищенная Банковская Сеть', desc: 'Максимальное шифрование и 0% потерь' },
    en: { name: '🔒 Secure Banking Network', desc: 'Highest grade encryption and 0% packet loss' }
  }
};

const FIELD_LABELS = {
  bandwidth: {
    uz: 'Bandwidth — Tarmoq tezligi',
    ru: 'Bandwidth — Пропускная способность',
    en: 'Bandwidth — Network Throughput'
  },
  latency: {
    uz: 'Latency — Kechikish',
    ru: 'Latency — Физическая задержка',
    en: 'Latency — Physical Latency'
  },
  loss: {
    uz: "Packet Loss — Yo'qotish",
    ru: 'Packet Loss — Потеря пакетов',
    en: 'Packet Loss — Packet Loss Rate'
  },
  jitter: {
    uz: 'Jitter — Tebranish',
    ru: 'Jitter — Джиттер (колебания)',
    en: 'Jitter — Delay Variation'
  },
  load: {
    uz: 'Network Load — Yuklama',
    ru: 'Network Load — Загрузка канала',
    en: 'Network Load — Channel Load'
  },
  users: {
    uz: 'Foydalanuvchilar soni',
    ru: 'Количество пользователей',
    en: 'Active Users Count'
  }
};

const I18N = {
  uz: {
    siteTitle: "Internet unumdorligi va xavfsizlik protokollarini baholash simulyatori",
    siteSub: "Talaba, O'qituvchi, Tarmoq Mutaxassisi va Administrator uchun yagona ilmiy platforma",
    homeWelcome: "Xush kelibsiz!",
    homeWelcomeDesc: "Internet unumdorligi va zamonaviy xavfsizlik protokollarini baholash tizimi.",
    btnStartSim: "⚡ Simulyatsiyani boshlash",
    btnRolesAuth: "🔑 Tizimga kirish / Rollar",
    btnNewSim: "＋ Yangi simulyatsiya",

    // Segmented Role Pill Switcher
    pillStudent: "Talaba",
    pillTeacher: "O'qituvchi",
    pillSpecialist: "Mutaxassis",
    pillAdmin: "Admin",

    // Navigation titles & links
    navHome: "Bosh sahifa",
    roleStudentTitle: "Talaba Paneli",
    navStudDash: "Talaba Dashboardi",
    navStudLabs: "Laboratoriya ishlari",
    navStudReports: "Mening hisobotlarim",
    roleTeacherTitle: "O'qituvchi Paneli",
    navTeaDash: "O'qituvchi Dashboardi",
    navTeaStudents: "Guruhlar va Talabalar",
    navTeaAssignments: "Topshiriqlar",
    navTeaReview: "Ishlarni baholash",
    roleSpecTitle: "Tarmoq Mutaxassisi",
    navSpecDash: "Mutaxassis Dashboardi",
    navSpecDiag: "Chuqur Diagnostika",
    navSpecMatrix: "Protokollar Matritsasi",
    roleAdminTitle: "Admin Panel (/admin)",
    navAdmDash: "Admin Dashboard",
    navAdmUsers: "Foydalanuvchilar",
    navAdmRoles: "Rollar va RBAC",
    navAdmLogs: "Audit va Xavfsizlik",
    navAdmDb: "Baza & Zaxira",
    navAdmSettings: "Tizim Sozlamalari",
    navToolsTitle: "Simulyatsiya Vositalari",
    navSimNew: "Simulyator",
    navTopo: "Jonli Topologiya",
    navResults: "Natijalar & Grafiklar",
    navProtocols: "Protokollar",
    navAi: "AI Diagnostika",
    navHistory: "Tarix",
    navSettings: "Sozlamalar",

    // Home KPIs & Titles
    kpiTotalSims: "Jami simulyatsiyalar",
    kpiAvgLat: "O'rtacha kechikish",
    kpiAvgLoss: "O'rtacha paket yo'qotilishi",
    kpiNetStatus: "Tarmoq holati",
    recentSimsTitle: "Oxirgi simulyatsiyalar",
    homeRolesTitle: "Platformaning 4 ta ixtisoslashtirilgan roli",

    // Subnav buttons
    subnavMainDash: "🎓 Asosiy Dashboard",
    subnavLabsCatalog: "📚 Laboratoriyalar Katalogi",
    subnavMyReports: "📝 Mening Hisobotlarim",
    subnavLiveSim: "⚡ Jonli Simulyator",
    subnavTopology: "⛶ Tarmoq Topologiyasi",
    subnavTeacherDash: "👨‍🏫 Asosiy Dashboard",
    subnavGroupsStudents: "👥 Guruhlar & Talabalar",
    subnavAssignments: "📋 Topshiriqlar Boshqaruvi",
    subnavReviewGrading: "✍️ Ishlarni Baholash",
    subnavTeacherSim: "⚡ O'qituvchi Simulyatori",
    subnavSpecDash: "🌐 Asosiy Dashboard",
    subnavDeepDiag: "🔍 Chuqur Diagnostika",
    subnavProtoMatrix: "🛡️ Protokollar Matritsasi",
    subnavStandards: "📊 Protokol Standartlari",
    subnavAdminDash: "🛡️ Asosiy Admin Panel",
    subnavUsersCrud: "👥 Foydalanuvchilar (CRUD)",
    subnavRbacRoles: "🔑 RBAC Rollar & Ruxsatlar",
    subnavAuditLogs: "📜 Xavfsizlik & Audit Loglari",
    subnavDbBackup: "💾 Ma'lumotlar Bazasi & Zaxira",
    subnavSysSettings: "⚙️ Tizim Sozlamalari",

    simRunBtn: "⚡ Simulyatsiyani boshlash",
    guest: "Mehmon",
    login: "Kirish",
    logout: "Chiqish",
    toastLangChanged: "Til o'zgartirildi: O'ZBEKCHA"
  },

  ru: {
    siteTitle: "Симулятор оценки производительности и протоколов безопасности Интернета",
    siteSub: "Единая научная платформа для Студента, Преподавателя, Сетевого специалиста и Администратора",
    homeWelcome: "Добро пожаловать!",
    homeWelcomeDesc: "Комплексная система анализа производительности и безопасности сетевых протоколов.",
    btnStartSim: "⚡ Начать симуляцию",
    btnRolesAuth: "🔑 Вход / Выбор роли",
    btnNewSim: "＋ Новая симуляция",

    // Segmented Role Pill Switcher
    pillStudent: "Студент",
    pillTeacher: "Преподаватель",
    pillSpecialist: "Специалист",
    pillAdmin: "Админ",

    // Navigation titles & links
    navHome: "Главная страница",
    roleStudentTitle: "Панель студента",
    navStudDash: "Дашборд студента",
    navStudLabs: "Лабораторные работы",
    navStudReports: "Мои отчеты",
    roleTeacherTitle: "Панель преподавателя",
    navTeaDash: "Дашборд преподавателя",
    navTeaStudents: "Группы и студенты",
    navTeaAssignments: "Задания",
    navTeaReview: "Проверка и оценка",
    roleSpecTitle: "Сетевой эксперт",
    navSpecDash: "Дашборд эксперта",
    navSpecDiag: "Глубокая диагностика",
    navSpecMatrix: "Матрица протоколов",
    roleAdminTitle: "Панель админа (/admin)",
    navAdmDash: "Панель управления",
    navAdmUsers: "Пользователи",
    navAdmRoles: "Роли и права RBAC",
    navAdmLogs: "Журнал аудита",
    navAdmDb: "База данных и бэкап",
    navAdmSettings: "Настройки системы",
    navToolsTitle: "Инструменты анализа",
    navSimNew: "Симулятор",
    navTopo: "Живая топология",
    navResults: "Результаты и графики",
    navProtocols: "Сравнение протоколов",
    navAi: "ИИ Диагностика",
    navHistory: "История симуляций",
    navSettings: "Настройки платформы",

    // Home KPIs & Titles
    kpiTotalSims: "Всего симуляций",
    kpiAvgLat: "Средняя задержка",
    kpiAvgLoss: "Средняя потеря пакетов",
    kpiNetStatus: "Состояние сети",
    recentSimsTitle: "Последние симуляции",
    homeRolesTitle: "4 специализированные роли платформы",

    // Subnav buttons
    subnavMainDash: "🎓 Главный дашборд",
    subnavLabsCatalog: "📚 Каталог лабораторий",
    subnavMyReports: "📝 Мои отчеты",
    subnavLiveSim: "⚡ Живой симулятор",
    subnavTopology: "⛶ Сетевая топология",
    subnavTeacherDash: "👨‍🏫 Главный дашборд",
    subnavGroupsStudents: "👥 Группы и студенты",
    subnavAssignments: "📋 Управление заданиями",
    subnavReviewGrading: "✍️ Оценка работ",
    subnavTeacherSim: "⚡ Симулятор преподавателя",
    subnavSpecDash: "🌐 Главный дашборд",
    subnavDeepDiag: "🔍 Глубокая диагностика",
    subnavProtoMatrix: "🛡️ Матрица протоколов",
    subnavStandards: "📊 Стандарты протоколов",
    subnavAdminDash: "🛡️ Главная панель админа",
    subnavUsersCrud: "👥 Пользователи (CRUD)",
    subnavRbacRoles: "🔑 Роли и права RBAC",
    subnavAuditLogs: "📜 Журнал безопасности",
    subnavDbBackup: "💾 База данных и бэкап",
    subnavSysSettings: "⚙️ Настройки системы",

    simRunBtn: "⚡ Запустить симуляцию",
    guest: "Гость",
    login: "Вход",
    logout: "Выход",
    toastLangChanged: "Язык интерфейса изменен: РУССКИЙ"
  },

  en: {
    siteTitle: "Simulator for Evaluating Internet Performance and Security Protocols",
    siteSub: "Integrated Scientific Platform for Student, Teacher, Network Specialist, and Administrator",
    homeWelcome: "Welcome!",
    homeWelcomeDesc: "Comprehensive system for analyzing network protocol performance and security.",
    btnStartSim: "⚡ Start Simulation",
    btnRolesAuth: "🔑 Sign In / Roles",
    btnNewSim: "＋ New Simulation",

    // Segmented Role Pill Switcher
    pillStudent: "Student",
    pillTeacher: "Teacher",
    pillSpecialist: "Specialist",
    pillAdmin: "Admin",

    // Navigation titles & links
    navHome: "Home Page",
    roleStudentTitle: "Student Panel",
    navStudDash: "Student Dashboard",
    navStudLabs: "Laboratory Works",
    navStudReports: "My Reports",
    roleTeacherTitle: "Teacher Panel",
    navTeaDash: "Teacher Dashboard",
    navTeaStudents: "Groups & Students",
    navTeaAssignments: "Assignments",
    navTeaReview: "Grading & Review",
    roleSpecTitle: "Network Specialist",
    navSpecDash: "Specialist Dashboard",
    navSpecDiag: "Deep Diagnostics",
    navSpecMatrix: "Protocols Matrix",
    roleAdminTitle: "Admin Panel (/admin)",
    navAdmDash: "Admin Dashboard",
    navAdmUsers: "Users Management",
    navAdmRoles: "Roles & RBAC",
    navAdmLogs: "Security & Audit Logs",
    navAdmDb: "Database & Backup",
    navAdmSettings: "System Settings",
    navToolsTitle: "Simulation Tools",
    navSimNew: "Simulator",
    navTopo: "Live Topology",
    navResults: "Results & Charts",
    navProtocols: "Protocols",
    navAi: "AI Diagnostics",
    navHistory: "History",
    navSettings: "Settings",

    // Home KPIs & Titles
    kpiTotalSims: "Total Simulations",
    kpiAvgLat: "Average Latency",
    kpiAvgLoss: "Average Packet Loss",
    kpiNetStatus: "Network Health",
    recentSimsTitle: "Recent Simulations",
    homeRolesTitle: "4 Specialized Platform Roles",

    // Subnav buttons
    subnavMainDash: "🎓 Main Dashboard",
    subnavLabsCatalog: "📚 Labs Catalog",
    subnavMyReports: "📝 My Reports",
    subnavLiveSim: "⚡ Live Simulator",
    subnavTopology: "⛶ Network Topology",
    subnavTeacherDash: "👨‍🏫 Main Dashboard",
    subnavGroupsStudents: "👥 Groups & Students",
    subnavAssignments: "📋 Assignments",
    subnavReviewGrading: "✍️ Grading & Review",
    subnavTeacherSim: "⚡ Teacher Simulator",
    subnavSpecDash: "🌐 Main Dashboard",
    subnavDeepDiag: "🔍 Deep Diagnostics",
    subnavProtoMatrix: "🛡️ Protocols Matrix",
    subnavStandards: "📊 Protocol Standards",
    subnavAdminDash: "🛡️ Main Admin Panel",
    subnavUsersCrud: "👥 Users (CRUD)",
    subnavRbacRoles: "🔑 Roles & RBAC",
    subnavAuditLogs: "📜 Security & Audit Logs",
    subnavDbBackup: "💾 Database & Backup",
    subnavSysSettings: "⚙️ System Settings",

    simRunBtn: "⚡ Run Simulation",
    guest: "Guest",
    login: "Sign In",
    logout: "Sign Out",
    toastLangChanged: "Language switched: ENGLISH"
  }
};

function changeLanguage(lang) {
  if (!I18N[lang]) lang = 'uz';
  CURRENT_LANG = lang;
  localStorage.setItem('ans_lang', lang);

  // 1. Til tugmalari holati (UZ | RU | EN)
  $$('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });

  const t = I18N[lang];

  // 2. Header
  const heading = $('#mainTitleHeading');
  if (heading) heading.textContent = t.siteTitle;
  const sub = $('#mainSubtitleHeading');
  if (sub) sub.textContent = t.siteSub;

  // 3. Segmented Role Pill Switcher (Talaba | O'qituvchi | Mutaxassis | Admin)
  const pillStudent = $('#rolePillSwitcher button[data-role="student"]');
  const pillTeacher = $('#rolePillSwitcher button[data-role="teacher"]');
  const pillSpecialist = $('#rolePillSwitcher button[data-role="specialist"]');
  const pillAdmin = $('#rolePillSwitcher button[data-role="admin"]');

  if (pillStudent) pillStudent.textContent = t.pillStudent;
  if (pillTeacher) pillTeacher.textContent = t.pillTeacher;
  if (pillSpecialist) pillSpecialist.textContent = t.pillSpecialist;
  if (pillAdmin) pillAdmin.textContent = t.pillAdmin;

  // 4. Sidebar navigatsiyasi
  const mapClasses = {
    '.i18n-nav-home': t.navHome,
    '.i18n-role-student-title': t.roleStudentTitle,
    '.i18n-nav-stud-dash': t.navStudDash,
    '.i18n-nav-stud-labs': t.navStudLabs,
    '.i18n-nav-stud-reports': t.navStudReports,
    '.i18n-role-teacher-title': t.roleTeacherTitle,
    '.i18n-nav-tea-dash': t.navTeaDash,
    '.i18n-nav-tea-students': t.navTeaStudents,
    '.i18n-nav-tea-assignments': t.navTeaAssignments,
    '.i18n-nav-tea-review': t.navTeaReview,
    '.i18n-role-spec-title': t.roleSpecTitle,
    '.i18n-nav-spec-dash': t.navSpecDash,
    '.i18n-nav-spec-diag': t.navSpecDiag,
    '.i18n-nav-spec-matrix': t.navSpecMatrix,
    '.i18n-role-admin-title': t.roleAdminTitle,
    '.i18n-nav-adm-dash': t.navAdmDash,
    '.i18n-nav-adm-users': t.navAdmUsers,
    '.i18n-nav-adm-roles': t.navAdmRoles,
    '.i18n-nav-adm-logs': t.navAdmLogs,
    '.i18n-nav-adm-db': t.navAdmDb,
    '.i18n-nav-adm-settings': t.navAdmSettings,
    '.i18n-nav-tools-title': t.navToolsTitle,
    '.i18n-nav-sim-new': t.navSimNew,
    '.i18n-nav-topo': t.navTopo,
    '.i18n-nav-results': t.navResults,
    '.i18n-nav-protocols': t.navProtocols,
    '.i18n-nav-ai': t.navAi,
    '.i18n-nav-history': t.navHistory,
    '.i18n-nav-settings': t.navSettings,
    '.i18n-kpi-total-sims': t.kpiTotalSims,
    '.i18n-kpi-avg-lat': t.kpiAvgLat,
    '.i18n-kpi-avg-loss': t.kpiAvgLoss,
    '.i18n-kpi-net-status': t.kpiNetStatus,
    '.i18n-recent-sims-title': t.recentSimsTitle
  };

  Object.entries(mapClasses).forEach(([sel, txt]) => {
    $$(sel).forEach(el => el.textContent = txt);
  });

  // 5. Bosh sahifa (Home) elementlari
  if ($('#homeWelcomeTitle')) $('#homeWelcomeTitle').textContent = t.homeWelcome;
  if ($('#homeWelcomeDesc')) $('#homeWelcomeDesc').textContent = t.homeWelcomeDesc;

  // 6. Dashboard ichki Sub-navigatsiya tugmalari (.dashboard-subnav button)
  $$('.dashboard-subnav button').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    if (oc.includes("show('student-dash')")) b.textContent = t.subnavMainDash;
    else if (oc.includes("show('student-labs')")) b.textContent = t.subnavLabsCatalog;
    else if (oc.includes("show('student-reports')")) b.textContent = t.subnavMyReports;
    else if (oc.includes("show('teacher-dash')")) b.textContent = t.subnavTeacherDash;
    else if (oc.includes("show('teacher-students')")) b.textContent = t.subnavGroupsStudents;
    else if (oc.includes("show('teacher-assignments')")) b.textContent = t.subnavAssignments;
    else if (oc.includes("show('teacher-review')")) b.textContent = t.subnavReviewGrading;
    else if (oc.includes("show('specialist-dash')")) b.textContent = t.subnavSpecDash;
    else if (oc.includes("show('specialist-diag')")) b.textContent = t.subnavDeepDiag;
    else if (oc.includes("show('specialist-matrix')")) b.textContent = t.subnavProtoMatrix;
    else if (oc.includes("show('admin-dash')")) b.textContent = t.subnavAdminDash;
    else if (oc.includes("show('admin-users')")) b.textContent = t.subnavUsersCrud;
    else if (oc.includes("show('admin-roles')")) b.textContent = t.subnavRbacRoles;
    else if (oc.includes("show('admin-logs')")) b.textContent = t.subnavAuditLogs;
    else if (oc.includes("show('admin-db')")) b.textContent = t.subnavDbBackup;
    else if (oc.includes("show('admin-settings')")) b.textContent = t.subnavSysSettings;
    else if (oc.includes("show('new')")) b.textContent = t.subnavLiveSim;
    else if (oc.includes("show('topology')")) b.textContent = t.subnavTopology;
    else if (oc.includes("show('protocols')")) b.textContent = t.subnavStandards;
  });

  // 7. Simulyator tugmasi va slayderlar
  if ($('#runBtn')) $('#runBtn').textContent = t.simRunBtn;
  FIELDS.forEach(f => {
    const lbl = $(`label[for="inp-${f.id}"]`);
    if (lbl && FIELD_LABELS[f.id]?.[lang]) {
      lbl.textContent = FIELD_LABELS[f.id][lang];
    }
  });

  // 8. Tezkor ssenariylarni yangi tilda qayta chizish
  renderPresets();

  // 9. Bosh sahifadagi 4 ta rol kartalarini tarjima qilish
  const homeCards = $$('#v-home .lab-card');
  if (homeCards.length >= 4) {
    // Talaba
    const c0 = homeCards[0];
    const h0 = c0.querySelector('h3'), p0 = c0.querySelector('p'), b0 = c0.querySelector('button');
    if (h0) h0.textContent = lang === 'ru' ? 'Лаборатории и обучение' : lang === 'en' ? 'Laboratories & Learning' : 'Laboratoriya va O\'rganish';
    if (p0) p0.textContent = lang === 'ru' ? 'Выполнение лабораторных работ, сравнение протоколов и сдача отчетов.' : lang === 'en' ? 'Complete lab exercises in real network conditions, compare protocols, and submit reports.' : 'Real tarmoq sharoitida laboratoriya ishlarini bajarish, protokollarni solishtirish va hisobot topshirish.';
    if (b0) b0.textContent = lang === 'ru' ? 'Войти как студент →' : lang === 'en' ? 'Sign in as Student →' : 'Talaba sifatida kirish →';

    // O'qituvchi
    const c1 = homeCards[1];
    const h1 = c1.querySelector('h3'), p1 = c1.querySelector('p'), b1 = c1.querySelector('button');
    if (h1) h1.textContent = lang === 'ru' ? 'Группы и оценивание' : lang === 'en' ? 'Groups & Evaluation' : 'Guruhlar & Baholash';
    if (p1) p1.textContent = lang === 'ru' ? 'Просмотр списка студентов, создание заданий и оценка сданных лабораторных работ.' : lang === 'en' ? 'View student rosters, create assignments, and review and grade submitted laboratory reports.' : 'Talabalar ro\'yxatini ko\'rish, topshiriqlar yaratish va topshirilgan laboratoriya ishlarini baholash.';
    if (b1) b1.textContent = lang === 'ru' ? 'Войти как преподаватель →' : lang === 'en' ? 'Sign in as Teacher →' : 'O\'qituvchi sifatida kirish →';

    // Mutaxassis
    const c2 = homeCards[2];
    const h2 = c2.querySelector('h3'), p2 = c2.querySelector('p'), b2 = c2.querySelector('button');
    if (h2) h2.textContent = lang === 'ru' ? 'Глубокий анализ сети' : lang === 'en' ? 'Deep Network Diagnostics' : 'Chuqur Tarmoq Tahlili';
    if (p2) p2.textContent = lang === 'ru' ? 'Формула Mathis TCP, BDP, теория очередей M/M/1, стресс-тесты ИИ и Goodput.' : lang === 'en' ? 'Mathis TCP formula, BDP, M/M/1 queueing delay theory, AI stress testing, and Goodput analysis.' : 'Mathis TCP formulasi, BDP, M/M/1 navbat nazariyasi, AI stress-test va Goodput tahlili.';
    if (b2) b2.textContent = lang === 'ru' ? 'Войти как эксперт →' : lang === 'en' ? 'Sign in as Specialist →' : 'Mutaxassis sifatida kirish →';

    // Admin
    const c3 = homeCards[3];
    const h3 = c3.querySelector('h3'), p3 = c3.querySelector('p'), b3 = c3.querySelector('button');
    if (h3) h3.textContent = lang === 'ru' ? 'Панель админа (/admin)' : lang === 'en' ? 'Admin Panel (/admin)' : 'Admin Panel (/admin)';
    if (p3) p3.textContent = lang === 'ru' ? 'Пользователи, роли RBAC, статистика системы, журнал аудита и резервные копии SQLite.' : lang === 'en' ? 'Users, RBAC roles, system statistics, security audit logs, and SQLite database backup.' : 'Foydalanuvchilar, RBAC rollar, tizim statistikasi, audit loglari va SQLite ma\'lumotlar bazasi zaxirasi.';
    if (b3) b3.textContent = lang === 'ru' ? 'Перейти в админку →' : lang === 'en' ? 'Go to Admin Panel →' : 'Admin panelga kirish →';
  }

  // 10. Agar mutaxassis jonli kalkulyatori mavjud bo'lsa, qayta hisoblaymiz
  if (typeof updateSpecLiveCalc === 'function') updateSpecLiveCalc();

  showToast(t.toastLangChanged, 'info');
}
window.changeLanguage = changeLanguage;

/* ---------- 3. YORDAMCHI API FUNKSIYALARI ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cls = s => (s === 'A\'lo' || s === 'Yaxshi') ? 'good' : s === 'Kritik' ? 'bad' : 'mid';
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

async function apiFetch(endpoint, options = {}) {
  const url = `${CONFIG.apiBase}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // Token muddati tugagan
      AUTH_TOKEN = null;
      CURRENT_USER = null;
      localStorage.removeItem('ans_token');
      localStorage.removeItem('ans_user');
      updateNavForRole('guest');
      return { status: 401, error: 'Avtorizatsiyadan o\'ting' };
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    console.warn("API fetch error, falling back:", err);
    return { status: 0, ok: false, error: err.message };
  }
}

/* ---------- 4. AVTORIZATSIYA VA RBAC BOSHQARUVI ---------- */
function updateNavForRole(role) {
  const r = (role || 'guest').toLowerCase();

  // Guruhlarni ko'rsatish/yashirish
  const grpStud = $('#navGroupStudent');
  const grpTea = $('#navGroupTeacher');
  const grpSpec = $('#navGroupSpecialist');
  const grpAdm = $('#navGroupAdmin');

  if (grpStud) grpStud.style.display = (r === 'student' || r === 'admin') ? 'flex' : 'none';
  if (grpTea) grpTea.style.display = (r === 'teacher' || r === 'admin') ? 'flex' : 'none';
  if (grpSpec) grpSpec.style.display = (r === 'specialist' || r === 'admin') ? 'flex' : 'none';
  if (grpAdm) grpAdm.style.display = (r === 'admin') ? 'flex' : 'none';

  // Profil chipi
  const avatar = $('#userAvatar');
  const nameDisp = $('#userNameDisplay');
  const roleBadge = $('#userRoleBadge');
  const btnLogout = $('#btnLogout');

  if (CURRENT_USER) {
    if (avatar) avatar.textContent = (CURRENT_USER.full_name || CURRENT_USER.username)[0].toUpperCase();
    if (nameDisp) nameDisp.textContent = CURRENT_USER.full_name || CURRENT_USER.username;
    if (roleBadge) {
      roleBadge.textContent = r.toUpperCase();
      roleBadge.className = `user-role-badge ${r}`;
    }
    if (btnLogout) btnLogout.style.display = 'block';
  } else {
    if (avatar) avatar.textContent = '?';
    if (nameDisp) nameDisp.textContent = 'Kirish';
    if (roleBadge) {
      roleBadge.textContent = 'Mehmon';
      roleBadge.className = 'user-role-badge';
    }
    if (btnLogout) btnLogout.style.display = 'none';
  }
}

async function checkAuth() {
  if (!AUTH_TOKEN) {
    updateNavForRole('guest');
    return;
  }
  const res = await apiFetch('/api/auth/me');
  if (res.ok && res.data && res.data.user) {
    CURRENT_USER = res.data.user;
    localStorage.setItem('ans_user', JSON.stringify(CURRENT_USER));
    updateNavForRole(CURRENT_USER.role);
  } else {
    AUTH_TOKEN = null;
    CURRENT_USER = null;
    localStorage.removeItem('ans_token');
    localStorage.removeItem('ans_user');
    updateNavForRole('guest');
  }
}

function openAuthModal() {
  const m = $('#authModal');
  if (m) m.classList.add('active');
}
function closeAuthModal() {
  const m = $('#authModal');
  if (m) m.classList.remove('active');
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('#tabLogin').classList.toggle('active', isLogin);
  $('#tabRegister').classList.toggle('active', !isLogin);
  $('#formLogin').style.display = isLogin ? 'block' : 'none';
  $('#formRegister').style.display = !isLogin ? 'block' : 'none';
}

async function quickLoginRole(roleName) {
  const accounts = {
    talaba: { username: 'talaba', password: 'talaba123' },
    oqituvchi: { username: 'oqituvchi', password: 'oqituvchi123' },
    mutaxassis: { username: 'mutaxassis', password: 'mutaxassis123' },
    admin: { username: 'admin', password: 'admin123' }
  };
  const creds = accounts[roleName];
  if (!creds) return;

  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(creds)
  });

  if (res.ok && res.data && res.data.token) {
    AUTH_TOKEN = res.data.token;
    CURRENT_USER = res.data.user;
    localStorage.setItem('ans_token', AUTH_TOKEN);
    localStorage.setItem('ans_user', JSON.stringify(CURRENT_USER));
    closeAuthModal();
    updateNavForRole(CURRENT_USER.role);
    showToast(`Xush kelibsiz, ${CURRENT_USER.full_name}! (${CURRENT_USER.role.toUpperCase()})`, 'success');

    // Tegishli dashboardga yo'naltirish
    if (CURRENT_USER.role === 'student') show('student-dash');
    else if (CURRENT_USER.role === 'teacher') show('teacher-dash');
    else if (CURRENT_USER.role === 'specialist') show('specialist-dash');
    else if (CURRENT_USER.role === 'admin') show('admin-dash');
  } else {
    showToast(res.data?.error || "Kirishda xatolik yuz berdi", 'error');
  }
}

/* ---------- ROL SEGMENTED PILL SWITCHER ---------- */
/* Talaba | O'qituvchi | Mutaxassis | Admin */
async function switchDashboardRole(role) {
  // 1. Darhol yuqoridagi qora pill knopkani yangilash
  $$('.role-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-role') === role);
  });

  const roleMap = {
    student: { user: 'talaba', pass: 'talaba123', view: 'student-dash', name: 'Talaba' },
    teacher: { user: 'oqituvchi', pass: 'oqituvchi123', view: 'teacher-dash', name: "O'qituvchi" },
    specialist: { user: 'mutaxassis', pass: 'mutaxassis123', view: 'specialist-dash', name: 'Tarmoq Mutaxassisi' },
    admin: { user: 'admin', pass: 'admin123', view: 'admin-dash', name: 'Administrator' }
  };

  const target = roleMap[role];
  if (!target) return;

  // Agar ayni shu rolda kirilgan bo'lsa, to'g'ridan-to'g'ri ko'rsatamiz
  if (CURRENT_USER && CURRENT_USER.role === role) {
    show(target.view);
    return;
  }

  // Agar administrator bo'lsa, tizimdan chiqmasdan boshqa rolni ko'rish huquqi beriladi
  if (CURRENT_USER && CURRENT_USER.role === 'admin' && role !== 'admin') {
    show(target.view);
    return;
  }

  // Aks holda avtomatik test hisobiga kirish
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: target.user, password: target.pass })
  });

  if (res.ok && res.data && res.data.token) {
    AUTH_TOKEN = res.data.token;
    CURRENT_USER = res.data.user;
    localStorage.setItem('ans_token', AUTH_TOKEN);
    localStorage.setItem('ans_user', JSON.stringify(CURRENT_USER));
    closeAuthModal();
    updateNavForRole(CURRENT_USER.role);
    showToast(`${CURRENT_USER.full_name} (${role.toUpperCase()}) kabineti ochildi`, 'success');
  }

  show(target.view);
}
window.switchDashboardRole = switchDashboardRole;

async function submitLogin(e) {
  e.preventDefault();
  const username = $('#loginUsername').value.trim();
  const password = $('#loginPassword').value.trim();

  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (res.ok && res.data && res.data.token) {
    AUTH_TOKEN = res.data.token;
    CURRENT_USER = res.data.user;
    localStorage.setItem('ans_token', AUTH_TOKEN);
    localStorage.setItem('ans_user', JSON.stringify(CURRENT_USER));
    closeAuthModal();
    updateNavForRole(CURRENT_USER.role);
    showToast(`Tizimga muvaffaqiyatli kirildi!`, 'success');

    if (CURRENT_USER.role === 'student') show('student-dash');
    else if (CURRENT_USER.role === 'teacher') show('teacher-dash');
    else if (CURRENT_USER.role === 'specialist') show('specialist-dash');
    else if (CURRENT_USER.role === 'admin') show('admin-dash');
  } else {
    showToast(res.data?.error || 'Login yoki parol noto\'g\'ri', 'error');
  }
}

async function submitRegister(e) {
  e.preventDefault();
  const fullName = $('#regFullName').value.trim();
  const username = $('#regUsername').value.trim();
  const email = $('#regEmail').value.trim();
  const role = $('#regRole').value;
  const password = $('#regPassword').value.trim();

  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ full_name: fullName, username, email, role, password })
  });

  if (res.ok && res.data && res.data.token) {
    AUTH_TOKEN = res.data.token;
    CURRENT_USER = res.data.user;
    localStorage.setItem('ans_token', AUTH_TOKEN);
    localStorage.setItem('ans_user', JSON.stringify(CURRENT_USER));
    closeAuthModal();
    updateNavForRole(CURRENT_USER.role);
    showToast(`Ro'yxatdan muvaffaqiyatli o'tdingiz!`, 'success');

    if (CURRENT_USER.role === 'student') show('student-dash');
    else if (CURRENT_USER.role === 'teacher') show('teacher-dash');
    else if (CURRENT_USER.role === 'specialist') show('specialist-dash');
  } else {
    showToast(res.data?.error || 'Ro\'yxatdan o\'tishda xatolik', 'error');
  }
}

function logoutUser() {
  apiFetch('/api/auth/logout', { method: 'POST' });
  AUTH_TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem('ans_token');
  localStorage.removeItem('ans_user');
  updateNavForRole('guest');
  showToast("Tizimdan chiqildi", 'info');
  show('home');
}

/* ---------- 5. SAHIFALARNI BOSHQARISH (ROUTER & RBAC) ---------- */
function show(viewName) {
  // Ruxsatlarni tekshirish
  const role = CURRENT_USER ? CURRENT_USER.role : 'guest';

  if (viewName.startsWith('student-') && role !== 'student' && role !== 'admin') {
    showToast("Ushbu bo'lim faqat Talaba uchun mo'ljallangan. Iltimos, talaba sifatida kiring.", 'warn');
    openAuthModal();
    return;
  }
  if (viewName.startsWith('teacher-') && role !== 'teacher' && role !== 'admin') {
    showToast("Ushbu bo'lim faqat O'qituvchi uchun mo'ljallangan.", 'warn');
    openAuthModal();
    return;
  }
  if (viewName.startsWith('specialist-') && role !== 'specialist' && role !== 'admin') {
    showToast("Ushbu bo'lim faqat Tarmoq Mutaxassisi uchun mo'ljallangan.", 'warn');
    openAuthModal();
    return;
  }
  if (viewName.startsWith('admin-') && role !== 'admin') {
    showToast("Kirish taqiqlangan! /admin paneli faqat Administrator uchun himoyalangan.", 'error');
    openAuthModal();
    return;
  }

  // Sahifalarni yashirish va faolini ochish
  $$('.view').forEach(v => v.classList.remove('show'));
  const target = $(`#v-${viewName}`);
  if (target) {
    target.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Sidebar navigatsiyasini faollashtirish
  $$('#sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-view') === viewName);
  });

  // Top segmented role pill switcher faolligini sinxronlash (Talaba | O'qituvchi | Mutaxassis | Admin)
  let activeRole = null;
  if (viewName.startsWith('student-')) activeRole = 'student';
  else if (viewName.startsWith('teacher-')) activeRole = 'teacher';
  else if (viewName.startsWith('specialist-')) activeRole = 'specialist';
  else if (viewName.startsWith('admin-')) activeRole = 'admin';

  if (activeRole) {
    $$('.role-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-role') === activeRole);
    });
  }

  // Dashboard ichki sub-navigatsiya tugmalarini sinxronlash
  $$('.dashboard-subnav button').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    const isActive = oc.includes(`show('${viewName}')`);
    b.classList.toggle('active', isActive);
    b.classList.toggle('ghost', !isActive);
  });

  // Mobil menyuni yopish
  $('#sidebar')?.classList.remove('open');

  // Sahifa yuklanganda kerakli ma'lumotlarni tortish
  handleViewLoad(viewName);
}

function handleViewLoad(viewName) {
  if (viewName === 'home') loadRecentTable();
  else if (viewName === 'student-dash') loadStudentDashboard();
  else if (viewName === 'student-labs') loadStudentLabs();
  else if (viewName === 'student-reports') loadStudentReports();
  else if (viewName === 'teacher-dash') loadTeacherDashboard();
  else if (viewName === 'teacher-students') loadTeacherStudents();
  else if (viewName === 'teacher-assignments') loadTeacherAssignments();
  else if (viewName === 'teacher-review') loadTeacherSubmissions();
  else if (viewName === 'specialist-dash') loadSpecialistDashboard();
  else if (viewName === 'specialist-diag') initSpecialistDiagForm();
  else if (viewName === 'specialist-matrix') loadSpecialistMatrix();
  else if (viewName === 'admin-dash') loadAdminDashboard();
  else if (viewName === 'admin-users') loadAdminUsers();
  else if (viewName === 'admin-roles') loadAdminRoles();
  else if (viewName === 'admin-logs') loadAdminAuditLogs();
  else if (viewName === 'admin-db') loadAdminDbInfo();
  else if (viewName === 'admin-settings') loadAdminSettings();
  else if (viewName === 'history') loadHistoryTable();
  else if (viewName === 'protocols') renderProtocolTable();
}

/* ---------- 6. TALABA (STUDENT) MODULI ---------- */
async function loadStudentDashboard() {
  const res = await apiFetch('/api/student/dashboard');
  if (res.ok && res.data) {
    const d = res.data;
    if (d.stats) {
      const totalLabs = d.stats.total_labs || 4;
      const subLabs = d.stats.submitted_labs || 2;
      const gradedLabs = d.stats.graded_labs || 2;
      const avgScore = d.stats.average_score || 96.5;

      $('#studStatTotalLabs').textContent = `${totalLabs} ta`;
      $('#studStatSubmitted').textContent = `${subLabs} ta`;
      $('#studStatGraded').textContent = `${gradedLabs} ta`;
      $('#studStatAvgScore').textContent = `${avgScore} ball`;

      // O'quv kursi progress barini yangilash
      const pct = Math.round((subLabs / Math.max(1, totalLabs)) * 100);
      const pBar = $('#studProgressBar');
      const pBadge = $('#studProgressBadge');
      if (pBar) pBar.style.width = `${pct}%`;
      if (pBadge) pBadge.textContent = `${pct}% Bajarildi`;
    }

    if (CURRENT_USER) {
      $('#studWelcomeName').textContent = `${CURRENT_USER.full_name} (Talaba)`;
      const grp = CURRENT_USER.profile?.group_name || '412-21 TATU';
      const fac = CURRENT_USER.profile?.faculty || 'Telekommunikatsiya texnologiyalari';
      $('#studWelcomeSub').textContent = `Guruh: ${grp} | Fakultet: ${fac}`;
    }

    // Biriktirilgan topshiriqlar jadvali
    const tbl = $('#studAssignmentsTbl');
    if (tbl) {
      if (!d.assignments || !d.assignments.length) {
        tbl.innerHTML = `<tr><td style="text-align:center; color:var(--mu); padding:20px;">Hozircha faol topshiriqlar yo'q</td></tr>`;
      } else {
        tbl.innerHTML = `
          <thead>
            <tr>
              <th>Topshiriq</th>
              <th>Kategoriya</th>
              <th>Muddat</th>
              <th>Holat</th>
              <th>Baho</th>
              <th>Amal</th>
            </tr>
          </thead>
          <tbody>
            ${d.assignments.map(a => `
              <tr>
                <td><b>${a.title}</b></td>
                <td><span class="role-badge student">${a.category || 'Tarmoq'}</span></td>
                <td>${a.due_date || '2026-11-25'}</td>
                <td><span class="status-pill ${a.submission_status || 'submitted'}">${a.submission_status === 'graded' ? 'Baholangan' : a.submission_status === 'submitted' ? 'Topshirilgan' : 'Kutilmoqda'}</span></td>
                <td><b>${a.grade !== null && a.grade !== undefined ? a.grade + ' / ' + a.max_score : '–'}</b></td>
                <td>
                  <button class="btn btn-sm" onclick="show('student-labs')">⚡ Bajarish</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        `;
      }
    }

    // Talabaning oxirgi hisobotlari jadvali
    const repTbl = $('#studRecentReportsTbl');
    if (repTbl) {
      const repRes = await apiFetch('/api/student/my-results');
      if (repRes.ok && repRes.data && repRes.data.length) {
        repTbl.innerHTML = `
          <thead>
            <tr>
              <th>Laboratoriya</th>
              <th>Topshirilgan sana</th>
              <th>Holat</th>
              <th>Baho</th>
              <th>O'qituvchi taqrizi</th>
            </tr>
          </thead>
          <tbody>
            ${repRes.data.map(r => `
              <tr>
                <td><b>${r.lab_title}</b></td>
                <td>${r.created_at}</td>
                <td><span class="status-pill ${r.status}">${r.status === 'graded' ? 'Baholangan' : 'Tekshirilmoqda'}</span></td>
                <td><b style="color:var(--ok)">${r.score !== null ? r.score + ' ball' : '–'}</b></td>
                <td style="font-size:0.85rem; color:var(--mu); max-width:280px;"><i>${r.teacher_feedback || 'Tekshirish jarayonida...'}</i></td>
              </tr>
            `).join('')}
          </tbody>
        `;
      } else {
        repTbl.innerHTML = `<tr><td style="text-align:center; color:var(--mu); padding:20px;">Hozircha topshirilgan hisobotlar mavjud emas</td></tr>`;
      }
    }
  }
}

async function loadStudentLabs() {
  const c = $('#studentLabsContainer');
  if (!c) return;
  c.innerHTML = '<div style="padding:20px; color:var(--mu);">Laboratoriyalar yuklanmoqda...</div>';

  const res = await apiFetch('/api/student/laboratories');
  if (res.ok && res.data) {
    const labs = res.data;
    c.innerHTML = labs.map(lab => `
      <div class="lab-card">
        <div>
          <div class="lab-card-top">
            <span class="role-badge student">${lab.category}</span>
            <span class="badge ${lab.difficulty === 'Boshlang\'ich' ? 'good' : lab.difficulty === 'Yuqori' ? 'bad' : 'mid'}">${lab.difficulty}</span>
          </div>
          <h3>${lab.title}</h3>
          <p>${lab.description}</p>
          <div class="lab-instructions-box">
            <b>Yo'riqnoma:</b><br>${lab.instructions || 'Simulyatorda kerakli protokollar va parametrlarni sozlang va natijalarni qayd eting.'}
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn btn-sm" onclick='startLabSimulation(${JSON.stringify(lab.default_params || {}).replace(/'/g, "&#39;")})'>⚡ Simulyatorga yuklash</button>
          <button class="btn btn-sm ghost" onclick="openSubmitLabModal(${lab.id})">📝 Hisobot topshirish</button>
        </div>
      </div>
    `).join('');
  }
}

function startLabSimulation(params) {
  // Simulyator formalarini to'ldirish
  if (params) {
    if (params.bandwidth && $(`#inp-bandwidth`)) $(`#inp-bandwidth`).value = params.bandwidth;
    if (params.latency && $(`#inp-latency`)) $(`#inp-latency`).value = params.latency;
    if (params.loss !== undefined && $(`#inp-loss`)) $(`#inp-loss`).value = params.loss;
    if (params.jitter !== undefined && $(`#inp-jitter`)) $(`#inp-jitter`).value = params.jitter;
    if (params.load !== undefined && $(`#inp-load`)) $(`#inp-load`).value = params.load;
    if (params.users !== undefined && $(`#inp-users`)) $(`#inp-users`).value = params.users;

    if (params.protocol) {
      currentProtocol = params.protocol;
      renderProtoSeg();
    }
  }
  show('new');
  showToast("Laboratoriya parametrlari simulyatorga yuklandi!", 'success');
}

async function loadStudentReports() {
  const tbl = $('#studentReportsTbl');
  if (!tbl) return;
  tbl.innerHTML = `<tr><td style="padding:20px; color:var(--mu);">Yuklanmoqda...</td></tr>`;

  const res = await apiFetch('/api/student/my-results');
  if (res.ok && res.data) {
    const list = res.data;
    if (!list.length) {
      tbl.innerHTML = `<tr><td style="text-align:center; padding:24px; color:var(--mu);">Hozircha topshirilgan hisobotlar mavjud emas</td></tr>`;
      return;
    }
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Laboratoriya</th>
          <th>Topshirilgan sana</th>
          <th>Holat</th>
          <th>Baho</th>
          <th>O'qituvchi taqrizi</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(r => `
          <tr>
            <td>#${r.id}</td>
            <td><b>${r.lab_title}</b></td>
            <td>${r.created_at}</td>
            <td><span class="status-pill ${r.status}">${r.status === 'graded' ? 'Baholandi' : 'Kutilmoqda'}</span></td>
            <td><b style="font-size:1.05rem; color:${r.score >= 80 ? 'var(--ok)' : r.score >= 60 ? 'var(--wa)' : 'var(--er)'}">${r.score !== null ? r.score + ' ball' : '–'}</b></td>
            <td style="font-size:0.88rem; color:var(--mu);">${r.teacher_feedback || 'Taqriz yozilmagan'}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }
}

async function openSubmitLabModal(preselectedLabId = null) {
  const m = $('#submitLabModal');
  if (!m) return;

  // Laboratoriyalar ro'yxatini yuklash
  const sel = $('#submitLabSelect');
  if (sel) {
    const res = await apiFetch('/api/student/laboratories');
    if (res.ok && res.data) {
      sel.innerHTML = res.data.map(l => `<option value="${l.id}" ${l.id === preselectedLabId ? 'selected' : ''}>${l.title}</option>`).join('');
    }
  }

  // Oxirgi simulyatsiya natijasini ko'rsatish
  const prev = $('#submitAttachSimPreview');
  if (prev) {
    if (LAST_SIMULATION_RESULT && LAST_SIMULATION_PARAMS) {
      prev.innerHTML = `✓ Oxirgi simulyatsiya: <b>${LAST_SIMULATION_PARAMS.protocol}</b> | Throughput: <b>${LAST_SIMULATION_RESULT.throughput.toFixed(1)} Mbit/s</b> | Latency: <b>${LAST_SIMULATION_RESULT.latency.toFixed(1)} ms</b> | Reyting: <b>${LAST_SIMULATION_RESULT.score} ball</b>`;
      prev.style.color = 'var(--ok)';
    } else {
      prev.innerHTML = `ℹ️ Hozircha yangi simulyatsiya o'tkazilmadi. Hozirgi parametrlar asos qilib olinadi.`;
      prev.style.color = 'var(--mu)';
    }
  }

  m.classList.add('active');
}

function closeSubmitLabModal() {
  $('#submitLabModal')?.classList.remove('active');
}

async function submitStudentLabReport(e) {
  e.preventDefault();
  const labId = parseInt($('#submitLabSelect').value);
  const notes = $('#submitStudentNotes').value.trim();

  const body = {
    lab_id: labId,
    student_notes: notes,
    params: LAST_SIMULATION_PARAMS || getFormValues(),
    metrics: LAST_SIMULATION_RESULT || {}
  };

  const res = await apiFetch('/api/student/submit-lab', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (res.ok) {
    showToast("Laboratoriya hisobotingiz muvaffaqiyatli topshirildi!", 'success');
    closeSubmitLabModal();
    $('#submitStudentNotes').value = '';
    show('student-reports');
  } else {
    showToast(res.data?.error || "Hisobotni topshirishda xatolik yuz berdi", 'error');
  }
}

/* ---------- 7. O'QITUVCHI (TEACHER) MODULI ---------- */
async function loadTeacherDashboard() {
  const res = await apiFetch('/api/teacher/dashboard');
  if (res.ok && res.data) {
    const d = res.data;
    if (d.stats) {
      $('#teaStatStudents').textContent = `${d.stats.total_students || 28} ta`;
      $('#teaStatGroups').textContent = `${d.stats.total_groups || 2} ta`;
      $('#teaStatPending').textContent = `${d.stats.pending_submissions || 1} ta`;
      $('#teaStatGraded').textContent = `${d.stats.graded_submissions || 2} ta`;
    }

    if (CURRENT_USER) {
      $('#teacherWelcomeName').textContent = `${CURRENT_USER.full_name} (O'qituvchi)`;
      $('#teacherWelcomeSub').textContent = `Kompyuter tarmoqlari kafedrasi | 304-xona`;
    }

    // Akademik guruhlar tahlili kartalari
    const grpContainer = $('#teacherGroupsSummaryCards');
    if (grpContainer) {
      grpContainer.innerHTML = `
        <div class="card" style="border:1px solid var(--bd); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <b style="font-size:1.05rem;">Guruh: 412-21 TATU</b>
            <span class="role-badge teacher">Telekommunikatsiya</span>
          </div>
          <div style="font-size:0.88rem; color:var(--mu); line-height:1.7;">
            <div>Talabalar soni: <b>18 ta</b></div>
            <div>O'rtacha o'zlashtirish: <b style="color:var(--ok)">88.5 ball</b></div>
            <div>Topshirish ko'rsatkichi: <b>92%</b></div>
          </div>
          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn btn-sm ghost" onclick="show('teacher-students')">Talabalar ro'yxati</button>
            <button class="btn btn-sm" onclick="openNewAssignmentModal()">＋ Topshiriq</button>
          </div>
        </div>

        <div class="card" style="border:1px solid var(--bd); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <b style="font-size:1.05rem;">Guruh: 411-21 TATU</b>
            <span class="role-badge specialist">Kiberxavfsizlik</span>
          </div>
          <div style="font-size:0.88rem; color:var(--mu); line-height:1.7;">
            <div>Talabalar soni: <b>10 ta</b></div>
            <div>O'rtacha o'zlashtirish: <b style="color:var(--ok)">83.0 ball</b></div>
            <div>Topshirish ko'rsatkichi: <b>85%</b></div>
          </div>
          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn btn-sm ghost" onclick="show('teacher-students')">Talabalar ro'yxati</button>
            <button class="btn btn-sm" onclick="openNewAssignmentModal()">＋ Topshiriq</button>
          </div>
        </div>
      `;
    }

    const tbl = $('#teaRecentSubmissionsTbl');
    if (tbl) {
      if (!d.recent_submissions || !d.recent_submissions.length) {
        tbl.innerHTML = `<tr><td style="padding:20px; color:var(--mu); text-align:center;">Hozircha topshirilgan ishlar yo'q</td></tr>`;
      } else {
        tbl.innerHTML = `
          <thead>
            <tr>
              <th>Talaba</th>
              <th>Guruh</th>
              <th>Laboratoriya</th>
              <th>Topshirilgan</th>
              <th>Holat</th>
              <th>Baho</th>
              <th>Amal</th>
            </tr>
          </thead>
          <tbody>
            ${d.recent_submissions.map(s => `
              <tr>
                <td><b>${s.student_name}</b></td>
                <td>${s.group_name || '412-21 TATU'}</td>
                <td>${s.lab_title}</td>
                <td>${s.created_at}</td>
                <td><span class="status-pill ${s.status}">${s.status === 'graded' ? 'Baholangan' : 'Kutilmoqda'}</span></td>
                <td><b>${s.score !== null ? s.score + ' ball' : '–'}</b></td>
                <td>
                  <button class="btn btn-sm ${s.status === 'graded' ? 'ghost' : ''}" onclick="openGradeModal(${s.id})">✍️ ${s.status === 'graded' ? 'Qayta baholash' : 'Baholash'}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        `;
      }
    }
  }
}

async function loadTeacherStudents() {
  const groupsRes = await apiFetch('/api/teacher/groups');
  const sumDiv = $('#teacherGroupsSummary');
  if (sumDiv && groupsRes.ok && groupsRes.data) {
    sumDiv.innerHTML = groupsRes.data.map(g => `
      <div class="card" style="flex:1; min-width:200px; padding:14px;">
        <span style="font-size:0.8rem; color:var(--mu); font-weight:700;">Guruh:</span>
        <h3 style="margin:4px 0 6px 0;">${g.group_name}</h3>
        <div style="font-size:0.85rem;">Talabalar: <b>${g.student_count} ta</b> | O'rtacha: <b>${g.group_avg_score} ball</b></div>
      </div>
    `).join('');
  }

  const tbl = $('#teacherStudentsTbl');
  if (!tbl) return;
  const res = await apiFetch('/api/teacher/students');
  if (res.ok && res.data) {
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Talaba</th>
          <th>Guruh</th>
          <th>Email</th>
          <th>Topshirgan ishlari</th>
          <th>O'rtacha baho</th>
          <th>Holat</th>
        </tr>
      </thead>
      <tbody>
        ${res.data.map(s => `
          <tr>
            <td><b>${s.full_name}</b> <small style="color:var(--mu);">(${s.username})</small></td>
            <td>${s.group_name || '412-21 TATU'}</td>
            <td>${s.email || '–'}</td>
            <td>${s.submissions_count} ta laboratoriya</td>
            <td><b style="color:var(--ok)">${s.avg_score} ball</b></td>
            <td><span class="status-pill ${s.status}">${s.status === 'active' ? 'Faol' : 'Bloklangan'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }
}

async function loadTeacherAssignments() {
  const tbl = $('#teacherAssignmentsTbl');
  if (!tbl) return;
  const res = await apiFetch('/api/teacher/assignments');
  if (res.ok && res.data) {
    const list = res.data;
    if (!list.length) {
      tbl.innerHTML = `<tr><td style="text-align:center; padding:20px; color:var(--mu);">Topshiriqlar mavjud emas</td></tr>`;
      return;
    }
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Topshiriq</th>
          <th>Laboratoriya shabloni</th>
          <th>Guruh</th>
          <th>Muddati</th>
          <th>Maksimal ball</th>
          <th>Topshirganlar</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(a => `
          <tr>
            <td><b>${a.title}</b><br><small style="color:var(--mu);">${a.description || ''}</small></td>
            <td>${a.lab_title}</td>
            <td><span class="role-badge teacher">${a.group_name}</span></td>
            <td>${a.due_date || 'Belgilanmagan'}</td>
            <td><b>${a.max_score} ball</b></td>
            <td><b>${a.submissions_count || 0} ta talaba</b></td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }
}

async function openNewAssignmentModal() {
  const m = $('#teacherAssignmentModal');
  if (!m) return;
  const sel = $('#asgnLabSelect');
  if (sel) {
    const res = await apiFetch('/api/student/laboratories');
    if (res.ok && res.data) {
      sel.innerHTML = res.data.map(l => `<option value="${l.id}">${l.title}</option>`).join('');
    }
  }
  m.classList.add('active');
}
function closeTeacherAssignmentModal() {
  $('#teacherAssignmentModal')?.classList.remove('active');
}

async function submitCreateAssignment(e) {
  e.preventDefault();
  const labId = parseInt($('#asgnLabSelect').value);
  const title = $('#asgnTitleInput').value.trim();
  const groupName = $('#asgnGroupInput').value.trim();
  const dueDate = $('#asgnDueDateInput').value;
  const maxScore = parseInt($('#asgnMaxScoreInput').value);
  const description = $('#asgnDescInput').value.trim();

  const res = await apiFetch('/api/teacher/assignments', {
    method: 'POST',
    body: JSON.stringify({ lab_id: labId, title, group_name: groupName, due_date: dueDate, max_score: maxScore, description })
  });

  if (res.ok) {
    showToast("Yangi topshiriq muvaffaqiyatli e'lon qilindi!", 'success');
    closeTeacherAssignmentModal();
    loadTeacherAssignments();
  } else {
    showToast(res.data?.error || "Topshiriq yaratishda xatolik", 'error');
  }
}

async function loadTeacherSubmissions(status = 'all') {
  const tbl = $('#teacherSubmissionsTbl');
  if (!tbl) return;
  const res = await apiFetch(`/api/teacher/submissions?status=${status}`);
  if (res.ok && res.data) {
    const list = res.data;
    if (!list.length) {
      tbl.innerHTML = `<tr><td style="text-align:center; padding:20px; color:var(--mu);">Ishlar topilmadi</td></tr>`;
      return;
    }
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Talaba</th>
          <th>Guruh</th>
          <th>Laboratoriya</th>
          <th>Talaba xulosasi</th>
          <th>Holat</th>
          <th>Baho</th>
          <th>Amal</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(s => `
          <tr>
            <td>#${s.id}</td>
            <td><b>${s.student_name}</b></td>
            <td>${s.group_name || '412-21 TATU'}</td>
            <td>${s.lab_title}</td>
            <td style="max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:0.85rem;">${s.student_notes}</td>
            <td><span class="status-pill ${s.status}">${s.status === 'graded' ? 'Baholangan' : 'Kutilmoqda'}</span></td>
            <td><b style="color:var(--ok)">${s.score !== null ? s.score + ' ball' : '–'}</b></td>
            <td>
              <button class="btn btn-sm ${s.status === 'graded' ? 'ghost' : ''}" onclick="openGradeModal(${s.id})">
                ${s.status === 'graded' ? 'Tahrirlash' : 'Baholash'}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }
}

async function openGradeModal(submissionId) {
  const m = $('#gradeModal');
  if (!m) return;
  $('#gradeSubmissionId').value = submissionId;

  // Ma'lumotlarni olish
  const res = await apiFetch(`/api/teacher/submissions`);
  if (res.ok && res.data) {
    const sub = res.data.find(s => s.id === submissionId);
    if (sub) {
      $('#gradeSubmissionDetails').innerHTML = `
        <div><b>Talaba:</b> ${sub.student_name} (${sub.group_name || '412-21 TATU'})</div>
        <div><b>Laboratoriya:</b> ${sub.lab_title}</div>
        <div style="margin-top:6px; padding:8px; background:var(--bg-card); border-radius:6px;">
          <b>Talaba xulosasi:</b><br>${sub.student_notes}
        </div>
      `;
      $('#gradeScoreInput').value = sub.score !== null ? sub.score : 90;
      $('#gradeFeedbackInput').value = sub.teacher_feedback || '';
    }
  }

  m.classList.add('active');
}
function closeGradeModal() {
  $('#gradeModal')?.classList.remove('active');
}

async function submitTeacherGrade(e) {
  e.preventDefault();
  const subId = parseInt($('#gradeSubmissionId').value);
  const score = parseFloat($('#gradeScoreInput').value);
  const feedback = $('#gradeFeedbackInput').value.trim();

  const res = await apiFetch(`/api/teacher/grade/${subId}`, {
    method: 'POST',
    body: JSON.stringify({ score, feedback })
  });

  if (res.ok) {
    showToast("Talaba ishi muvaffaqiyatli baholandi!", 'success');
    closeGradeModal();
    loadTeacherSubmissions();
    loadTeacherDashboard();
  } else {
    showToast(res.data?.error || "Baholashda xatolik yuz berdi", 'error');
  }
}

/* ---------- 8. TARMOQ MUTAXASSISI (SPECIALIST) MODULI ---------- */
async function loadSpecialistDashboard() {
  if (CURRENT_USER) {
    $('#specWelcomeName').textContent = `${CURRENT_USER.full_name} (Tarmoq Mutaxassisi)`;
    const org = CURRENT_USER.profile?.organization || 'Uztelecom NOC';
    const certs = CURRENT_USER.profile?.certifications || 'CCNP, CISSP';
    $('#specWelcomeSub').textContent = `${org} | Sertifikatlar: ${certs}`;
  }

  // Jonli matematik hisob-kitobni ishga tushirish
  updateSpecLiveCalc();

  // 8 ta protokollar qiyosiy matritsasini chizish
  const tbl = $('#specDashMatrixTbl');
  if (tbl) {
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Protokol</th>
          <th>Transport</th>
          <th>Handshake RTT</th>
          <th>Shifrlash</th>
          <th>HoL Blocking</th>
          <th>Unumdorlik</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><b>HTTP/1.1</b></td><td>TCP</td><td>2 RTT</td><td>Yo'q (Ochiq matn)</td><td>Mavjud (Boshida to'xtash)</td><td>O'rta (60/100)</td></tr>
        <tr><td><b>HTTPS (TLS 1.2)</b></td><td>TCP + TLS</td><td>3 RTT</td><td>AES-CBC / RSA</td><td>Mavjud</td><td>Yaxshi (72/100)</td></tr>
        <tr><td><b>HTTPS (TLS 1.3)</b></td><td>TCP + TLS</td><td>1-2 RTT (0-RTT)</td><td>AES-GCM / ChaCha20</td><td>Mavjud (TCP darajasida)</td><td>Yuqori (92/100)</td></tr>
        <tr><td><b>HTTP/2</b></td><td>TCP + TLS</td><td>2 RTT</td><td>TLS 1.2 / 1.3</td><td>Mavjud (TCP darajasida)</td><td>A'lo (88/100)</td></tr>
        <tr><td><b>HTTP/3 (QUIC)</b></td><td>UDP + QUIC</td><td>0-1 RTT</td><td>TLS 1.3 Ichki majburiy</td><td>Yo'q (Stream izolyatsiya)</td><td>Maksimal (98/100)</td></tr>
        <tr><td><b>WebSocket (WSS)</b></td><td>TCP + TLS</td><td>2 RTT (1 marta)</td><td>WSS / TLS</td><td>Minimal</td><td>A'lo (89/100)</td></tr>
        <tr><td><b>SSH-2</b></td><td>TCP</td><td>2 RTT</td><td>ChaCha20 / Curve25519</td><td>Mavjud</td><td>Xavfsiz (94/100)</td></tr>
        <tr><td><b>DNS-over-HTTPS (DoH)</b></td><td>TCP / UDP</td><td>1-2 RTT</td><td>TLS 1.3 / HTTPS</td><td>Yo'q</td><td>A'lo (91/100)</td></tr>
      </tbody>
    `;
  }
}

function updateSpecLiveCalc() {
  const bw = parseFloat($('#specLiveBw')?.value || 100);
  const rtt = parseFloat($('#specLiveRtt')?.value || 40);
  const loss = parseFloat($('#specLiveLoss')?.value || 0.5);
  const load = parseFloat($('#specLiveLoad')?.value || 60);

  if ($('#specLiveBwVal')) $('#specLiveBwVal').textContent = `${bw} Mbit/s`;
  if ($('#specLiveRttVal')) $('#specLiveRttVal').textContent = `${rtt} ms`;
  if ($('#specLiveLossVal')) $('#specLiveLossVal').textContent = `${loss.toFixed(2)} %`;
  if ($('#specLiveLoadVal')) $('#specLiveLoadVal').textContent = `${load} %`;

  // 1. Mathis TCP Throughput Formula: Throughput <= (MSS * 1.22) / (RTT * sqrt(p))
  const mssBits = 1460 * 8; // bits
  const rttSec = rtt / 1000;
  const p = Math.max(0.0001, loss / 100);
  const mathisThroughputBps = (mssBits * 1.22) / (rttSec * Math.sqrt(p));
  const mathisMbps = Math.min(bw, mathisThroughputBps / 1e6);

  // 2. Bandwidth-Delay Product (BDP) = Bandwidth * RTT
  const bdpKb = ((bw * 1e6 / 8) * (rtt / 1000)) / 1024;

  // 3. M/M/1 Queuing Delay: Wq = rho / [mu * (1 - rho)]
  const rho = Math.min(0.98, load / 100);
  const serviceTimeMs = (1500 * 8 / (bw * 1e6)) * 1000;
  const wqMs = (rho / (1 - rho)) * serviceTimeMs;

  // 4. Tavsiya etilgan protokol
  let recProto = 'HTTPS (TLS 1.3)';
  if (loss >= 1.0 || rtt > 100) {
    recProto = 'HTTP/3 (QUIC)';
  } else if (load > 75) {
    recProto = 'HTTP/2 (Multiplexed)';
  } else {
    recProto = 'HTTPS (TLS 1.3)';
  }

  if ($('#specResMathis')) $('#specResMathis').textContent = `${mathisMbps.toFixed(2)} Mbit/s`;
  if ($('#specResMathisSub')) $('#specResMathisSub').textContent = `Maksimal TCP unumdorligi (MSS=1460B)`;
  if ($('#specResBdp')) $('#specResBdp').textContent = `${bdpKb.toFixed(1)} KB`;
  if ($('#specResWq')) $('#specResWq').textContent = `${wqMs.toFixed(2)} ms`;
  if ($('#specResProto')) $('#specResProto').textContent = recProto;
}
window.updateSpecLiveCalc = updateSpecLiveCalc;

function initSpecialistDiagForm() {
  const c = $('#specDiagFields');
  if (!c || c.children.length) return;

  const specFields = [
    { id:'spec-bw', label:'Kanal o\'tkazuvchanligi (Bandwidth)', unit:'Mbit/s', val:100 },
    { id:'spec-lat', label:'Fizik kechikish (Base Latency)', unit:'ms', val:35 },
    { id:'spec-loss', label:'Paket yo\'qotilishi (Packet Loss)', unit:'%', val:0.5 },
    { id:'spec-load', label:'Kanal yuklamasi (Network Load)', unit:'%', val:55 },
    { id:'spec-users', label:'Faol oqimlar (Active Users/Flows)', unit:'ta', val:200 },
    { id:'spec-mtu', label:'MTU o\'lchami (Packet MTU)', unit:'Bayt', val:1500 }
  ];

  c.innerHTML = specFields.map(f => `
    <div class="field">
      <label>${f.label} (${f.unit})</label>
      <input type="number" id="${f.id}" class="txt" value="${f.val}">
    </div>
  `).join('');

  $('#btnRunDeepDiag')?.addEventListener('click', runSpecialistDeepDiag);
}

async function runSpecialistDeepDiag() {
  const params = {
    bandwidth: parseFloat($('#spec-bw')?.value || 100),
    latency: parseFloat($('#spec-lat')?.value || 35),
    loss: parseFloat($('#spec-loss')?.value || 0.5),
    load: parseFloat($('#spec-load')?.value || 55),
    users: parseInt($('#spec-users')?.value || 200),
    mtu: parseInt($('#spec-mtu')?.value || 1500),
    protocol: currentProtocol || 'HTTPS/TLS 1.3',
    qos: 'none'
  };

  const res = await apiFetch('/api/specialist/deep-diagnostics', {
    method: 'POST',
    body: JSON.stringify(params)
  });

  const box = $('#specDiagResultsBox');
  const grid = $('#specMathGrid');
  if (!box || !grid) return;

  if (res.ok && res.data) {
    const m = res.data.deep_metrics;
    box.style.display = 'block';

    grid.innerHTML = `
      <div class="math-card">
        <h4>Mathis TCP Nazariy Chegarasi</h4>
        <div class="math-card-formula">Throughput ≤ (MSS·1.22)/(RTT·√p)</div>
        <div class="math-card-value">${m.mathis_throughput_limit_mbps} Mbit/s</div>
        <div class="math-card-desc">Joriy yo'qotish (${params.loss}%) va kechikish ostidagi maksimal TCP tezligi.</div>
      </div>

      <div class="math-card">
        <h4>Optimal Socket Buferi (BDP)</h4>
        <div class="math-card-formula">BDP = Bandwidth × RTT</div>
        <div class="math-card-value">${m.bdp_optimal_socket_buffer}</div>
        <div class="math-card-desc">Tarmoq quvurini 100% to'ldirish uchun zarur bo'lgan TCP oyna buferi.</div>
      </div>

      <div class="math-card">
        <h4>M/M/1 Navbat Kechikishi</h4>
        <div class="math-card-formula">W_q = ρ / [μ(1 - ρ)]</div>
        <div class="math-card-value">+${m.mm1_queuing_delay_ms} ms</div>
        <div class="math-card-desc">Router navbati sababli qo'shilgan kechikish (Kanal bandligi: ${(m.rho_utilization*100).toFixed(1)}%).</div>
      </div>

      <div class="math-card">
        <h4>Kriptografik Goodput Yo'qotilishi</h4>
        <div class="math-card-formula">Goodput = Throughput - Overhead</div>
        <div class="math-card-value">-${m.crypto_overhead_waste_mbps} Mbit/s</div>
        <div class="math-card-desc">${params.protocol} shifrlash sarlavhalari uchun sarflangan foydali kanal.</div>
      </div>
    `;
    showToast("Chuqur tarmoq diagnostikasi hisoblandi!", 'success');
  }
}

function loadSpecialistMatrix() {
  const tbl = $('#specMatrixTbl');
  if (!tbl) return;

  const protocolsList = Object.keys(PROTO);
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Protokol</th>
        <th>Xavfsizlik darajasi</th>
        <th>Handshake (RTT)</th>
        <th>Overhead yuki</th>
        <th>CPU resursi</th>
        <th>Xavfsizlik reytingi</th>
        <th>Asosiy xususiyat</th>
      </tr>
    </thead>
    <tbody>
      ${protocolsList.map(name => {
        const p = PROTO[name];
        return `
          <tr>
            <td><b>${name}</b></td>
            <td><span class="role-badge ${p.secScore >= 85 ? 'specialist' : p.secScore >= 50 ? 'teacher' : 'admin'}">${p.sec}</span></td>
            <td><b>${p.rtts || 1.0} RTT</b> (+${p.latAdd} ms)</td>
            <td><b style="color:${p.ovhPct >= 10 ? 'var(--er)' : 'var(--ok)'}">+${p.ovhPct}%</b></td>
            <td>${p.cpu || 0.5}x</td>
            <td><b style="color:var(--ok)">${p.secScore} / 100</b></td>
            <td style="font-size:0.85rem; color:var(--mu);">${p.desc}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
}

/* ---------- 9. ADMINISTRATOR (ADMIN) MODULI — /admin ---------- */
let ADMIN_USERS_CACHE = [];

async function loadAdminDashboard() {
  const res = await apiFetch('/api/admin/dashboard');
  if (res.ok && res.data) {
    const d = res.data;
    if (d.stats) {
      $('#admStatUsers').textContent = d.stats.total_users || 4;
      $('#admStatLabs').textContent = d.stats.total_labs || 4;
      $('#admStatSims').textContent = d.stats.total_simulations || 0;
      $('#admStatDbSize').textContent = (d.stats.db_size_kb || 152) + ' KB';

      // Rollar taqsimoti charti
      renderAdminRolesChart(d.stats.users_by_role || { admin: 1, teacher: 1, student: 1, specialist: 1 });
    }

    // Tezkor foydalanuvchilar jadvali
    const usersTbl = $('#admDashUsersTbl');
    if (usersTbl) {
      const uRes = await apiFetch('/api/admin/users');
      if (uRes.ok && uRes.data) {
        usersTbl.innerHTML = `
          <thead>
            <tr>
              <th>FIO</th>
              <th>Login</th>
              <th>Rol</th>
              <th>Holat</th>
              <th>Yaratilgan</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            ${uRes.data.map(u => `
              <tr>
                <td><b>${u.full_name}</b></td>
                <td><code>${u.username}</code></td>
                <td><span class="user-role-badge ${u.role}">${u.role.toUpperCase()}</span></td>
                <td><span class="status-pill ${u.is_active ? 'active' : 'blocked'}">${u.is_active ? 'Faol' : 'Bloklangan'}</span></td>
                <td>${u.created_at}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-sm ghost" onclick="openAdminUserModal(${u.id})">Tahrirlash</button>
                    <button class="btn btn-sm ${u.is_active ? 'danger' : 'success'}" onclick="toggleUserStatus(${u.id})">${u.is_active ? 'Bloklash' : 'Faol'}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        `;
      }
    }

    const tbl = $('#admRecentLogsTbl');
    if (tbl && d.recent_logs) {
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Foydalanuvchi</th>
            <th>Amal (Action)</th>
            <th>Ob'ekt</th>
            <th>IP-manzil</th>
            <th>Holat</th>
            <th>Sana</th>
          </tr>
        </thead>
        <tbody>
          ${d.recent_logs.map(l => `
            <tr>
              <td><b>${l.username || 'Tizim'}</b></td>
              <td><code>${l.action}</code></td>
              <td>${l.entity_type || '–'}</td>
              <td>${l.ip_address}</td>
              <td><span class="status-pill ${l.status === 'SUCCESS' ? 'active' : 'blocked'}">${l.status}</span></td>
              <td>${l.created_at}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }
  }
}

let chartAdminRolesInstance = null;
function renderAdminRolesChart(rolesData) {
  const ctx = $('#cAdminRoles')?.getContext('2d');
  if (!ctx) return;
  if (chartAdminRolesInstance) chartAdminRolesInstance.destroy();

  const labels = Object.keys(rolesData);
  const data = Object.values(rolesData);

  chartAdminRolesInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.map(l => l.toUpperCase()),
      datasets: [{
        data: data,
        backgroundColor: ['#2563eb', '#7c3aed', '#0284c7', '#dc2626']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

async function loadAdminUsers() {
  const tbl = $('#adminUsersTbl');
  if (!tbl) return;
  const role = $('#admRoleFilter')?.value || 'all';

  const res = await apiFetch(`/api/admin/users?role=${role}`);
  if (res.ok && res.data) {
    ADMIN_USERS_CACHE = res.data;
    renderAdminUsersTable(ADMIN_USERS_CACHE);
  }
}

function filterAdminUsers() {
  const q = ($('#admUserSearch')?.value || '').toLowerCase();
  const filtered = ADMIN_USERS_CACHE.filter(u =>
    u.username.toLowerCase().includes(q) ||
    u.full_name.toLowerCase().includes(q) ||
    (u.email && u.email.toLowerCase().includes(q))
  );
  renderAdminUsersTable(filtered);
}

function renderAdminUsersTable(users) {
  const tbl = $('#adminUsersTbl');
  if (!tbl) return;

  if (!users.length) {
    tbl.innerHTML = `<tr><td style="text-align:center; padding:20px; color:var(--mu);">Foydalanuvchilar topilmadi</td></tr>`;
    return;
  }

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Foydalanuvchi</th>
        <th>To'liq ism</th>
        <th>Email</th>
        <th>Rol</th>
        <th>Holat</th>
        <th>Oxirgi kirish</th>
        <th>Amallar</th>
      </tr>
    </thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td>#${u.id}</td>
          <td><b>${u.username}</b></td>
          <td>${u.full_name}</td>
          <td>${u.email || '–'}</td>
          <td><span class="role-badge ${u.role}">${u.role}</span></td>
          <td><span class="status-pill ${u.status}">${u.status === 'active' ? 'Faol' : 'Bloklangan'}</span></td>
          <td>${u.last_login || 'Kirilmagan'}</td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" onclick="openAdminUserModal(${u.id})" title="Tahrirlash">✏️</button>
              <button class="btn-icon ${u.status === 'active' ? 'danger' : 'success'}" onclick="adminToggleUserStatus(${u.id})" title="${u.status === 'active' ? 'Bloklash' : 'Faollashtirish'}">
                ${u.status === 'active' ? '🔒' : '🔓'}
              </button>
              <button class="btn-icon" onclick="openAdminResetPwdModal(${u.id}, '${u.username}')" title="Parolni tiklash">🔑</button>
              <button class="btn-icon danger" onclick="adminDeleteUser(${u.id})" title="O'chirish">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function openAdminUserModal(userId = null) {
  const m = $('#adminUserModal');
  if (!m) return;
  const isEdit = userId !== null;

  $('#adminUserModalTitle').textContent = isEdit ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi qo'shish";
  $('#admUserId').value = isEdit ? userId : '';
  $('#admPasswordGroup').style.display = isEdit ? 'none' : 'block';
  $('#admStatusGroup').style.display = isEdit ? 'block' : 'none';

  if (isEdit) {
    const u = ADMIN_USERS_CACHE.find(x => x.id === userId);
    if (u) {
      $('#admUsernameInput').value = u.username;
      $('#admFullNameInput').value = u.full_name;
      $('#admEmailInput').value = u.email || '';
      $('#admRoleSelect').value = u.role;
      $('#admStatusSelect').value = u.status;
    }
  } else {
    $('#admUsernameInput').value = '';
    $('#admFullNameInput').value = '';
    $('#admEmailInput').value = '';
    $('#admPasswordInput').value = '';
    $('#admRoleSelect').value = 'student';
    $('#admStatusSelect').value = 'active';
  }

  m.classList.add('active');
}
function closeAdminUserModal() {
  $('#adminUserModal')?.classList.remove('active');
}

async function submitAdminUserForm(e) {
  e.preventDefault();
  const userId = $('#admUserId').value;
  const isEdit = Boolean(userId);

  const payload = {
    username: $('#admUsernameInput').value.trim(),
    full_name: $('#admFullNameInput').value.trim(),
    email: $('#admEmailInput').value.trim(),
    role: $('#admRoleSelect').value,
    status: $('#admStatusSelect').value
  };

  if (!isEdit) {
    payload.password = $('#admPasswordInput').value.trim();
  }

  const endpoint = isEdit ? `/api/admin/users/${userId}` : `/api/admin/users`;
  const method = isEdit ? 'PUT' : 'POST';

  const res = await apiFetch(endpoint, {
    method: method,
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    showToast(isEdit ? "Foydalanuvchi yangilandi" : "Yangi foydalanuvchi yaratildi", 'success');
    closeAdminUserModal();
    loadAdminUsers();
  } else {
    showToast(res.data?.error || "Amalni bajarishda xatolik", 'error');
  }
}

async function adminToggleUserStatus(userId) {
  const res = await apiFetch(`/api/admin/users/${userId}/toggle-status`, { method: 'POST' });
  if (res.ok) {
    showToast("Foydalanuvchi holati o'zgartirildi", 'success');
    loadAdminUsers();
  } else {
    showToast(res.data?.error || "Xatolik yuz berdi", 'error');
  }
}

function openAdminResetPwdModal(userId, username) {
  const m = $('#adminResetPwdModal');
  if (!m) return;
  $('#resetPwdUserId').value = userId;
  $('#resetPwdUsernameDisplay').textContent = username;
  $('#resetPwdNewInput').value = '';
  m.classList.add('active');
}
function closeAdminResetPwdModal() {
  $('#adminResetPwdModal')?.classList.remove('active');
}

async function submitAdminResetPassword(e) {
  e.preventDefault();
  const uid = $('#resetPwdUserId').value;
  const newPwd = $('#resetPwdNewInput').value.trim();

  const res = await apiFetch(`/api/admin/users/${uid}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPwd })
  });

  if (res.ok) {
    showToast("Parol muvaffaqiyatli yangilandi", 'success');
    closeAdminResetPwdModal();
  } else {
    showToast(res.data?.error || "Parolni o'zgartirishda xatolik", 'error');
  }
}

async function adminDeleteUser(userId) {
  if (!confirm("Haqiqatan ham ushbu foydalanuvchini tizimdan butunlay o'chirmoqchimisiz?")) return;

  const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast("Foydalanuvchi o'chirildi", 'info');
    loadAdminUsers();
  } else {
    showToast(res.data?.error || "O'chirishda xatolik", 'error');
  }
}

async function loadAdminRoles() {
  const c = $('#adminRolesContainer');
  if (!c) return;

  const res = await apiFetch('/api/admin/roles');
  if (res.ok && res.data) {
    c.innerHTML = `
      <div class="labs-grid">
        ${res.data.map(r => `
          <div class="lab-card">
            <div>
              <div class="lab-card-top">
                <span class="role-badge ${r.name}">${r.name.toUpperCase()}</span>
                <span style="font-size:0.8rem; color:var(--mu);">ID: ${r.id}</span>
              </div>
              <h3>${r.display_name}</h3>
              <p>${r.description}</p>
              <div style="margin-top:10px;">
                <b>Biriktirilgan ruxsatlar (Permissions):</b>
                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:8px;">
                  ${r.permissions.map(p => `
                    <span style="background:var(--bg-input); padding:3px 7px; border-radius:4px; font-size:0.75rem; font-family:'JetBrains Mono', monospace;">
                      ${p.permission_key}
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

async function loadAdminAuditLogs() {
  const tbl = $('#adminAuditLogsTbl');
  if (!tbl) return;
  const act = $('#admLogActionFilter')?.value || 'all';

  const res = await apiFetch(`/api/admin/audit-logs?action=${act}`);
  if (res.ok && res.data) {
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Foydalanuvchi</th>
          <th>Amal</th>
          <th>Ob'ekt</th>
          <th>Tafsilotlar</th>
          <th>IP-manzil</th>
          <th>Holat</th>
          <th>Vaqt</th>
        </tr>
      </thead>
      <tbody>
        ${res.data.map(l => `
          <tr>
            <td>#${l.id}</td>
            <td><b>${l.username || 'Tizim'}</b></td>
            <td><code>${l.action}</code></td>
            <td>${l.entity_type || '–'}</td>
            <td style="font-size:0.85rem;">${l.details || ''}</td>
            <td>${l.ip_address}</td>
            <td><span class="status-pill ${l.status === 'SUCCESS' ? 'active' : 'blocked'}">${l.status}</span></td>
            <td>${l.created_at}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }
}

async function loadAdminDbInfo() {
  const res = await apiFetch('/api/admin/database/info');
  if (res.ok && res.data) {
    const d = res.data;
    $('#admDbTablesCount').textContent = d.tables_count + ' ta';
    $('#admDbSizeText').textContent = d.database_size_kb + ' KB';
    $('#admDbVersion').textContent = 'SQLite ' + d.sqlite_version;

    const tbl = $('#adminDbTablesTbl');
    if (tbl && d.tables) {
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Jadval nomi</th>
            <th>Qatorlar soni</th>
            <th>Vazifasi</th>
          </tr>
        </thead>
        <tbody>
          ${d.tables.map(t => `
            <tr>
              <td><code>${t.name}</code></td>
              <td><b>${t.count} ta qator</b></td>
              <td style="color:var(--mu); font-size:0.85rem;">Asosiy tizim jadvali</td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }
  }
}

async function downloadDatabaseBackup() {
  showToast("Zaxira nusxasi tayyorlanmoqda...", 'info');
  const res = await apiFetch('/api/admin/database/backup');
  if (res.ok && res.data) {
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulator_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Zaxira nusxasi muvaffaqiyatli yuklandi!", 'success');
  } else {
    showToast("Zaxira nusxasini olishda xatolik yuz berdi", 'error');
  }
}

async function vacuumDatabase() {
  if (!confirm("Ma'lumotlar bazasini defragmentatsiya (VACUUM) qilishni tasdiqlaysizmi?")) return;
  const res = await apiFetch('/api/admin/database/vacuum', { method: 'POST' });
  if (res.ok) {
    showToast(res.data.message || "Baza muvaffaqiyatli optimallashtirildi!", 'success');
    loadAdminDbInfo();
  }
}

async function loadAdminSettings() {
  const c = $('#adminSettingsFields');
  if (!c) return;
  const res = await apiFetch('/api/admin/settings');
  if (res.ok && res.data) {
    c.innerHTML = res.data.map(s => `
      <div class="field">
        <label>${s.description || s.setting_key} <code>(${s.setting_key})</code></label>
        <input type="text" class="txt" data-setting-key="${s.setting_key}" value="${s.setting_value}">
      </div>
    `).join('');
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  const inputs = $$('#adminSettingsFields input[data-setting-key]');
  const settings = {};
  inputs.forEach(inp => {
    settings[inp.getAttribute('data-setting-key')] = inp.value.trim();
  });

  const res = await apiFetch('/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify({ settings })
  });

  if (res.ok) {
    showToast("Tizim sozlamalari muvaffaqiyatli saqlandi!", 'success');
  } else {
    showToast(res.data?.error || "Sozlamalarni saqlashda xatolik", 'error');
  }
}

/* ---------- 10. SIMULYATSIYA VA FIZIKA DVIGATELI ---------- */
let currentProtocol = 'HTTPS/TLS 1.3';

function initFields() {
  const c = $('#fields');
  if (!c || c.children.length) return;
  const lang = CURRENT_LANG || 'uz';
  c.innerHTML = FIELDS.map(f => {
    const lbl = FIELD_LABELS[f.id]?.[lang] || f.label;
    return `
    <div class="field">
      <div class="field-head">
        <label for="inp-${f.id}">${lbl}</label>
        <div class="field-val"><input type="number" id="num-${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.val}"><span>${f.unit}</span></div>
      </div>
      ${f.slider ? `<input type="range" id="inp-${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.val}">` : ''}
    </div>
  `;
  }).join('');

  FIELDS.forEach(f => {
    const range = $(`#inp-${f.id}`), num = $(`#num-${f.id}`);
    if (range && num) {
      range.oninput = () => num.value = range.value;
      num.oninput = () => range.value = num.value;
    }
  });

  renderProtoSeg();
  renderPresets();
}

function renderProtoSeg() {
  const seg = $('#protoSeg');
  if (!seg) return;
  seg.innerHTML = Object.keys(PROTO).map(k => {
    const p = PROTO[k];
    const isAct = k === currentProtocol;
    return `
      <div class="proto-card ${isAct ? 'active' : ''}" onclick="selectProtocol('${k}')">
        <div class="proto-top">
          <b>${k}</b>
          <span class="role-badge ${p.secScore >= 85 ? 'specialist' : p.secScore >= 50 ? 'teacher' : 'admin'}">${p.sec}</span>
        </div>
        <p>${p.desc}</p>
        <div style="font-size:0.75rem; color:var(--mu); margin-top:6px;">Handshake: ${p.rtts || 1} RTT | Overhead: +${p.ovhPct}%</div>
      </div>
    `;
  }).join('');
}

function selectProtocol(protoName) {
  currentProtocol = protoName;
  renderProtoSeg();
}

function renderPresets() {
  const c = $('#presetList');
  if (!c) return;
  const lang = CURRENT_LANG || 'uz';
  c.innerHTML = PRESETS.map(p => {
    const loc = PRESET_I18N[p.id]?.[lang] || { name: p.name, desc: p.desc };
    return `
      <div class="preset-card" onclick="applyPreset('${p.id}')">
        <b>${loc.name}</b>
        <p>${loc.desc}</p>
      </div>
    `;
  }).join('');
}

function applyPreset(pid) {
  const p = PRESETS.find(x => x.id === pid);
  if (!p) return;
  Object.keys(p.params).forEach(k => {
    if (k === 'protocol') selectProtocol(p.params[k]);
    const r = $(`#inp-${k}`), n = $(`#num-${k}`);
    if (r) r.value = p.params[k];
    if (n) n.value = p.params[k];
  });
  showToast(`"${p.name}" stsenariysi yuklandi`, 'info');
}

function getFormValues() {
  const vals = {};
  FIELDS.forEach(f => {
    const n = $(`#num-${f.id}`);
    vals[f.id] = n ? parseFloat(n.value) : f.val;
  });
  vals.protocol = currentProtocol;
  vals.qos = 'none';
  vals.mtu = 1500;
  return vals;
}

async function runSimulation() {
  const loader = $('#loader');
  if (loader) loader.classList.add('show');

  const params = getFormValues();
  LAST_SIMULATION_PARAMS = params;

  let results, ai;

  if (CONFIG.useBackend) {
    const res = await apiFetch('/api/simulation', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    if (res.ok && res.data) {
      results = res.data.results;
      ai = res.data.ai;
    }
  }

  // Agar backend javob bermasa yoki lokal bo'lsa
  if (!results) {
    const simRes = simulatePhysicsLocal(params);
    results = { current: simRes, curve: [] };
    ai = localAI(params, simRes);
  }

  LAST_SIMULATION_RESULT = results.current;
  saveToLocalHistory(params, results.current);

  await sleep(400);
  if (loader) loader.classList.remove('show');

  renderResults(results.current);
  renderCharts(params, results);
  renderAIAnalysis(ai);

  show('results');
  showToast("Simulyatsiya muvaffaqiyatli hisoblandi!", 'success');
}

function simulatePhysicsLocal(p) {
  const P = PROTO[p.protocol] || PROTO['HTTPS/TLS 1.3'];
  const lat = p.latency + (p.load / 100) * 15 + P.latAdd;
  const loss = p.loss + Math.max(0, p.load - 65) * 0.04;
  const throughput = Math.max(0.1, p.bandwidth * (1 - P.ovhPct / 100) * (1 - p.load / 250));
  const goodput = throughput * (1 - P.ovhPct / 100);
  const jitter = p.jitter * (1 + p.load / 80);
  const score = clamp(100 - (lat * 0.2) - (loss * 6) - (p.load * 0.2), 0, 100);
  const status = score >= 82 ? "A'lo" : score >= 65 ? 'Yaxshi' : score >= 42 ? "O'rtacha" : 'Kritik';

  return {
    latency_ms: round(lat, 1),
    packet_loss: round(loss, 2),
    throughput_mbps: round(throughput, 1),
    goodput_mbps: round(goodput, 1),
    jitter_ms: round(jitter, 1),
    overhead_pct: P.ovhPct,
    security_score: P.secScore,
    overall_score: round(score, 1),
    status: status,
    bufferbloat_score: round(clamp((lat - p.latency) * 1.5, 0, 100), 1),
    bdp_kb: round((throughput * 1e6 / 8) * (lat / 1000) / 1024, 1),
    handshake_ms: round((P.rtts || 1) * lat, 1),
    efficiency_pct: round((goodput / p.bandwidth) * 100, 1)
  };
}

const round = (n, d = 1) => Number(Math.round(n + "e" + d) + "e-" + d);

function renderResults(r) {
  const box = $('#resBox');
  if (!box) return;
  box.innerHTML = `
    <div class="rgrid">
      <div class="card"><span>Throughput</span><b>${r.throughput_mbps} <small>Mbit/s</small></b></div>
      <div class="card"><span>Goodput</span><b style="color:var(--ok)">${r.goodput_mbps} <small>Mbit/s</small></b></div>
      <div class="card"><span>Latency (Kechikish)</span><b>${r.latency_ms} <small>ms</small></b></div>
      <div class="card"><span>Packet Loss</span><b style="color:${r.packet_loss > 1.5 ? 'var(--er)' : 'var(--tx)'}">${r.packet_loss}%</b></div>
      <div class="card"><span>Handshake vaqti</span><b>${r.handshake_ms || (r.latency_ms * 1.5).toFixed(1)} <small>ms</small></b></div>
      <div class="card"><span>Xavfsizlik reytingi</span><b style="color:var(--ok)">${r.security_score || 88} / 100</b></div>
      <div class="card"><span>Bufferbloat indeksi</span><b>${r.bufferbloat_score || 15}%</b></div>
      <div class="card"><span>Umumiy holat</span><b>${badge(r.status)}</b></div>
    </div>
  `;
}

function renderAIAnalysis(ai) {
  const box = $('#aiBox');
  if (!box || !ai) return;

  box.innerHTML = `
    <div class="card" style="border-left: 4px solid var(--accent);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h2>Sun'iy Intellekt Neyron Diagnostikasi (AI Suite)</h2>
        <span class="badge ${cls(ai.predicted_health || ai.cls)}">AI Bahosi: ${ai.predicted_health || ai.cls}</span>
      </div>
      <p style="margin: 12px 0 16px 0; font-size:1.02rem; line-height:1.6;">
        ${ai.analysis || `Tarmoq unumdorligi ${ai.overall_score || 85} ball bilan baholandi.`}
      </p>

      <h3>Aniqlangan anomaliyalar va tahdidlar:</h3>
      <div style="display:flex; flex-direction:column; gap:10px; margin: 12px 0;">
        ${(ai.anomalies || []).map(a => `
          <div style="background:var(--bg-input); padding:12px; border-radius:8px; border-left:3px solid ${a.severity === 'critical' ? 'var(--er)' : 'var(--wa)'};">
            <b>${a.name}</b> (${a.severity.toUpperCase()})
            <p style="margin:4px 0; font-size:0.88rem;">${a.desc}</p>
            <small style="color:var(--ok); font-weight:700;">Tavsiya: ${a.mitigation}</small>
          </div>
        `).join('') || '<div style="color:var(--ok); font-weight:700;">✓ Kritik xavfsizlik va fizik anomaliyalar aniqlanmadi.</div>'}
      </div>

      <h3 style="margin-top:16px;">AI Tavsiyalari:</h3>
      <ul style="padding-left:20px; line-height:1.6;">
        ${(ai.recommendations || [ai.recommendation]).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  `;
}

/* ---------- 11. GRAFIKLAR (CHART.JS) ---------- */
let chartInstances = {};

function renderCharts(p, results) {
  // Chart 1: Latency dinamikasi
  const ctx1 = $('#c1')?.getContext('2d');
  if (ctx1) {
    if (chartInstances.c1) chartInstances.c1.destroy();
    const loads = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
    const latData = loads.map(l => p.latency + (l / 100) * 22 + (PROTO[p.protocol]?.latAdd || 2));

    chartInstances.c1 = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: loads.map(l => l + '%'),
        datasets: [{
          label: 'Latency (ms)',
          data: latData,
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.1)',
          fill: true,
          tension: 0.35
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 2: Packet Loss
  const ctx2 = $('#c2')?.getContext('2d');
  if (ctx2) {
    if (chartInstances.c2) chartInstances.c2.destroy();
    chartInstances.c2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['Minimal', 'Hozirgi', 'Kritik'],
        datasets: [{
          label: 'Packet Loss (%)',
          data: [p.loss * 0.5, results.current.packet_loss, results.current.packet_loss * 2.5],
          backgroundColor: ['#15803d', '#d97706', '#dc2626']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 3: Bandwidth vs Throughput
  const ctx3 = $('#c3')?.getContext('2d');
  if (ctx3) {
    if (chartInstances.c3) chartInstances.c3.destroy();
    chartInstances.c3 = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Kanal Kengligi', 'Throughput', 'Goodput'],
        datasets: [{
          label: 'Mbit/s',
          data: [p.bandwidth, results.current.throughput_mbps, results.current.goodput_mbps],
          backgroundColor: ['#2563eb', '#0284c7', '#15803d']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 4: Overhead nisbati
  const ctx4 = $('#c4')?.getContext('2d');
  if (ctx4) {
    if (chartInstances.c4) chartInstances.c4.destroy();
    chartInstances.c4 = new Chart(ctx4, {
      type: 'doughnut',
      data: {
        labels: ['Foydali trafik (Goodput)', 'Kriptografik Overhead'],
        datasets: [{
          data: [100 - (results.current.overhead_pct || 5), results.current.overhead_pct || 5],
          backgroundColor: ['#15803d', '#dc2626']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 5: Protokollar reytingi
  const ctx5 = $('#c5')?.getContext('2d');
  if (ctx5) {
    if (chartInstances.c5) chartInstances.c5.destroy();
    const plist = ['HTTPS/TLS 1.3', 'HTTP/3 (QUIC)', 'WireGuard', 'OpenVPN/IPSec', 'HTTP/1.1'];
    chartInstances.c5 = new Chart(ctx5, {
      type: 'bar',
      data: {
        labels: plist,
        datasets: [{
          label: 'Xavfsizlik & Unumdorlik',
          data: plist.map(k => PROTO[k].secScore),
          backgroundColor: '#7c3aed'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 6: Radar tarmoq salomatligi
  const ctx6 = $('#c6')?.getContext('2d');
  if (ctx6) {
    if (chartInstances.c6) chartInstances.c6.destroy();
    chartInstances.c6 = new Chart(ctx6, {
      type: 'radar',
      data: {
        labels: ['Tezlik', 'Kechikish', 'Xavfsizlik', 'Barqarorlik', 'Goodput'],
        datasets: [{
          label: 'Tarmoq ko\'rsatkichlari',
          data: [85, 80, results.current.security_score || 88, 75, 90],
          backgroundColor: 'rgba(2, 132, 199, 0.2)',
          borderColor: '#0284c7',
          pointBackgroundColor: '#0284c7'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

/* ---------- 12. JONLI TOPOLOGIYA (CANVAS ANIMATSIYA) ---------- */
let topoAnimId = null;
let topoRunning = true;
let packets = [];

function initTopology() {
  const cvs = $('#topoCanvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  function resizeCanvas() {
    cvs.width = cvs.parentElement.clientWidth - 40;
    cvs.height = 360;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function drawTopology() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    const w = cvs.width, h = cvs.height;
    const clientX = 80, clientY = h / 2;
    const routerX = w / 2, routerY = h / 2;
    const serverX = w - 80, serverY = h / 2;

    // Aloqa liniyalari
    ctx.strokeStyle = '#dfd8c8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(clientX, clientY);
    ctx.lineTo(routerX, routerY);
    ctx.lineTo(serverX, serverY);
    ctx.stroke();

    // Tugunlar (Nodes)
    drawNode(ctx, clientX, clientY, '🖥️ Mijoz (Client)', '#2563eb');
    drawNode(ctx, routerX, routerY, '🔀 Router / SQM', '#d97706');
    drawNode(ctx, serverX, serverY, '☁️ Server / TLS', '#15803d');

    // Paketlar harakati
    if (topoRunning && Math.random() < 0.3) {
      packets.push({ x: clientX, y: clientY, targetX: serverX, speed: 4 + Math.random() * 3, dropped: Math.random() < 0.05 });
    }

    packets.forEach((p, idx) => {
      p.x += p.speed;
      ctx.fillStyle = p.dropped && p.x > routerX ? '#dc2626' : '#22c55e';
      ctx.beginPath();
      ctx.arc(p.x, p.y + Math.sin(p.x * 0.05) * 4, 5, 0, Math.PI * 2);
      ctx.fill();

      if (p.x >= p.targetX || (p.dropped && p.x > routerX + 40)) {
        packets.splice(idx, 1);
        const sent = $('#tpSent'), del = $('#tpDelivered'), drop = $('#tpDropped');
        if (sent) sent.textContent = parseInt(sent.textContent) + 1;
        if (p.dropped) {
          if (drop) drop.textContent = parseInt(drop.textContent) + 1;
        } else {
          if (del) del.textContent = parseInt(del.textContent) + 1;
        }
      }
    });

    topoAnimId = requestAnimationFrame(drawTopology);
  }

  drawTopology();

  $('#topoToggleBtn')?.addEventListener('click', () => {
    topoRunning = !topoRunning;
    $('#topoToggleBtn').textContent = topoRunning ? '⏸ To\'xtatish' : '▶ Davom etish';
  });

  $('#topoBurstBtn')?.addEventListener('click', () => {
    for (let i = 0; i < 40; i++) {
      packets.push({ x: 80, y: cvs.height / 2, targetX: cvs.width - 80, speed: 5 + Math.random() * 5, dropped: Math.random() < 0.25 });
    }
    showToast("Paketlar bo'roni yuborildi!", 'warn');
  });
}

function drawNode(ctx, x, y, label, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 12px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + 36);
}

/* ---------- 13. TARIX VA PROTOKOLLAR JADVALI ---------- */
function saveToLocalHistory(params, result) {
  let list = JSON.parse(localStorage.getItem(KEY) || '[]');
  const item = {
    id: `SIM-${String(list.length + 1).padStart(3, '0')}`,
    date: new Date().toLocaleString(),
    input: params,
    result: result
  };
  list.unshift(item);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
  loadRecentTable();
}

function loadRecentTable() {
  const tbl = $('#recentTbl');
  if (!tbl) return;
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');

  $('#sTotal').textContent = list.length;
  if (!list.length) {
    tbl.innerHTML = `<tr><td style="text-align:center; padding:16px; color:var(--mu);">Hozircha simulyatsiyalar yo'q</td></tr>`;
    return;
  }

  const avgLat = list.reduce((a, b) => a + (b.result.latency_ms || 35), 0) / list.length;
  const avgLoss = list.reduce((a, b) => a + (b.result.packet_loss || 0.5), 0) / list.length;
  $('#sLat').textContent = avgLat.toFixed(1) + ' ms';
  $('#sLoss').textContent = avgLoss.toFixed(2) + '%';
  $('#sStatus').textContent = list[0].result.status || 'Yaxshi';

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Sana</th>
        <th>Protokol</th>
        <th>Throughput</th>
        <th>Latency</th>
        <th>Packet Loss</th>
        <th>Holat</th>
      </tr>
    </thead>
    <tbody>
      ${list.slice(0, 5).map(i => `
        <tr>
          <td><b>${i.id}</b></td>
          <td>${i.date}</td>
          <td><b>${i.input.protocol}</b></td>
          <td>${i.result.throughput_mbps} Mbit/s</td>
          <td>${i.result.latency_ms} ms</td>
          <td>${i.result.packet_loss}%</td>
          <td>${badge(i.result.status)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function loadHistoryTable() {
  const tbl = $('#histTbl');
  if (!tbl) return;
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  const q = ($('#histSearch')?.value || '').toLowerCase();
  const filter = $('#histFilter')?.value || 'all';

  const filtered = list.filter(i => {
    if (filter !== 'all' && i.result.status !== filter) return false;
    if (q && !i.id.toLowerCase().includes(q) && !i.input.protocol.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!filtered.length) {
    tbl.innerHTML = `<tr><td style="text-align:center; padding:20px; color:var(--mu);">Tarix topilmadi</td></tr>`;
    return;
  }

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Sana</th>
        <th>Protokol</th>
        <th>Bandwidth</th>
        <th>Throughput</th>
        <th>Latency</th>
        <th>Loss</th>
        <th>Score</th>
        <th>Holat</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.map(i => `
        <tr>
          <td><b>${i.id}</b></td>
          <td>${i.date}</td>
          <td>${i.input.protocol}</td>
          <td>${i.input.bandwidth} Mbit/s</td>
          <td>${i.result.throughput_mbps} Mbit/s</td>
          <td>${i.result.latency_ms} ms</td>
          <td>${i.result.packet_loss}%</td>
          <td><b>${i.result.overall_score || 85}</b></td>
          <td>${badge(i.result.status)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function renderProtocolTable() {
  const tbl = $('#protoTbl');
  if (!tbl) return;
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Protokol</th>
        <th>Xavfsizlik darajasi</th>
        <th>Overhead yuki</th>
        <th>Handshake</th>
        <th>Reyting</th>
        <th>Tavsif</th>
      </tr>
    </thead>
    <tbody>
      ${Object.keys(PROTO).map(k => {
        const p = PROTO[k];
        return `
          <tr>
            <td><b>${k}</b></td>
            <td><span class="role-badge ${p.secScore >= 85 ? 'specialist' : p.secScore >= 50 ? 'teacher' : 'admin'}">${p.sec}</span></td>
            <td>+${p.ovhPct}%</td>
            <td>${p.rtts || 1} RTT</td>
            <td><b style="color:var(--ok)">${p.secScore} / 100</b></td>
            <td style="color:var(--mu); font-size:0.85rem;">${p.desc}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
}

function runPresetSim(pid) {
  applyPreset(pid);
  show('new');
  showToast("Laboratoriya parametrlari simulyatorga yuklandi!", 'success');
}
window.runPresetSim = runPresetSim;

function backupAdminDatabase() {
  downloadDatabaseBackup();
}
window.backupAdminDatabase = backupAdminDatabase;

function vacuumAdminDatabase() {
  vacuumDatabase();
}
window.vacuumAdminDatabase = vacuumAdminDatabase;

/* ---------- 14. BOSH TIZIM ISHGA TUSHIRISH (INIT) ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  initFields();
  initTopology();

  // Ranglar mavzusini o'rnatish
  const savedTheme = localStorage.getItem('ans_theme') || 'vanilla';
  document.documentElement.setAttribute('data-theme', savedTheme);
  $$('.theme-dot').forEach(d => {
    d.classList.toggle('active', d.getAttribute('data-theme') === savedTheme);
    d.addEventListener('click', () => {
      const th = d.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', th);
      localStorage.setItem('ans_theme', th);
      $$('.theme-dot').forEach(x => x.classList.remove('active'));
      d.classList.add('active');
    });
  });

  // Tilni sozlash
  changeLanguage(CURRENT_LANG);

  // Avtorizatsiyani tekshirish
  await checkAuth();

  // URL / Path yoki Hash tekshirish
  if (window.location.pathname.startsWith('/admin') || window.location.hash === '#admin') {
    if (CURRENT_USER && CURRENT_USER.role === 'admin') {
      show('admin-dash');
    } else {
      switchDashboardRole('admin');
    }
  } else if (window.location.hash === '#student') {
    switchDashboardRole('student');
  } else if (window.location.hash === '#teacher') {
    switchDashboardRole('teacher');
  } else if (window.location.hash === '#specialist') {
    switchDashboardRole('specialist');
  } else {
    if (CURRENT_USER) {
      if (CURRENT_USER.role === 'student') show('student-dash');
      else if (CURRENT_USER.role === 'teacher') show('teacher-dash');
      else if (CURRENT_USER.role === 'specialist') show('specialist-dash');
      else if (CURRENT_USER.role === 'admin') show('admin-dash');
      else show('home');
    } else {
      show('home');
    }
  }

  // Sidebar navigatsiya tugmalari hodisasi
  $$('#sidebarNav a[data-view]').forEach(a => {
    a.addEventListener('click', () => {
      const v = a.getAttribute('data-view');
      show(v);
    });
  });

  // Mobil menyu
  $('#menuBtn')?.addEventListener('click', () => {
    $('#sidebar')?.classList.toggle('open');
  });

  // Simulyatsiya tugmasi
  $('#runBtn')?.addEventListener('click', runSimulation);

  // Tarix qidiruv va filtri
  $('#histSearch')?.addEventListener('input', loadHistoryTable);
  $('#histFilter')?.addEventListener('change', loadHistoryTable);

  // Sozlamalar saqlash
  $('#saveCfg')?.addEventListener('click', () => {
    CONFIG.useBackend = $('#useApi')?.checked ?? true;
    CONFIG.apiBase = $('#apiBase')?.value || 'http://localhost:8080';
    localStorage.setItem('ans_cfg', JSON.stringify(CONFIG));
    showToast("Sozlamalar saqlandi", 'success');
  });

  // Eksport tugmalari
  $('#btnExportJson')?.addEventListener('click', () => {
    if (!LAST_SIMULATION_RESULT) return showToast("Avval simulyatsiya o'tkazing", 'warn');
    const b = new Blob([JSON.stringify({ params: LAST_SIMULATION_PARAMS, result: LAST_SIMULATION_RESULT }, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'sim_result.json'; a.click();
  });

  $('#btnExportCsv')?.addEventListener('click', () => {
    if (!LAST_SIMULATION_RESULT) return showToast("Avval simulyatsiya o'tkazing", 'warn');
    const r = LAST_SIMULATION_RESULT;
    const csv = `Parametr,Qiymat\nProtocol,${r.protocol || currentProtocol}\nThroughput_Mbps,${r.throughput_mbps}\nLatency_ms,${r.latency_ms}\nPacketLoss_pct,${r.packet_loss}\nScore,${r.overall_score}`;
    const b = new Blob([csv], { type: 'text/csv' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'sim_result.csv'; a.click();
  });

  $('#btnPrintReport')?.addEventListener('click', () => window.print());
});
