import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { DurableObject } from "cloudflare:workers";

type Bindings = {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  ADMIN_USER: string;
  ADMIN_PASS: string;
};

// --- 1. MODERN & BEAUTIFUL FRONTEND ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>سامانه متمرکز مدیریت سازمان | دانیال</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css">
    <style>
        @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css');
        :root { --main-bg: #f0f2f5; --glass: rgba(255, 255, 255, 0.95); --primary: #4f46e5; }
        body { background: var(--main-bg); font-family: Vazirmatn, sans-serif; transition: all 0.3s; }
        .glass-card { background: var(--glass); border-radius: 20px; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
        .btn-primary { background: var(--primary); border: none; border-radius: 12px; padding: 10px 20px; }
        .nav-custom { background: white; box-shadow: 0 2px 15px rgba(0,0,0,0.05); }
        .hidden { display: none !important; }
        .chat-container { height: 400px; overflow-y: auto; background: #fff; border-radius: 15px; padding: 20px; border: 1px solid #eee; }
        .task-card { border-right: 5px solid var(--primary); transition: transform 0.2s; }
        .task-card:hover { transform: scale(1.02); }
    </style>
</head>
<body>

<nav class="navbar nav-custom mb-4 hidden" id="mainNav">
  <div class="container">
    <span class="navbar-brand fw-bold text-primary"><i class="bi bi-cpu-fill me-2"></i> پنل هوشمند دانیال</span>
    <button class="btn btn-outline-danger btn-sm rounded-pill" onclick="logout()">خروج از سیستم</button>
  </div>
</nav>

<div class="container pb-5">
    <div id="loginSection" class="row justify-content-center mt-5 pt-5">
        <div class="col-md-5">
            <div class="glass-card p-4 text-center">
                <div class="mb-4">
                    <i class="bi bi-shield-lock text-primary" style="font-size: 3rem;"></i>
                    <h3 class="fw-bold mt-2">خوش آمدید</h3>
                    <p class="text-muted small">لطفاً سطح دسترسی خود را انتخاب کنید</p>
                </div>
                <div class="btn-group w-100 mb-4 shadow-sm rounded-3 overflow-hidden">
                    <input type="radio" class="btn-check" name="ltype" id="l_staff" checked onchange="updateLoginUI('staff')">
                    <label class="btn btn-outline-primary border-0" for="l_staff">پرسنل شرکت</label>
                    <input type="radio" class="btn-check" name="ltype" id="l_boss" onchange="updateLoginUI('boss')">
                    <label class="btn btn-outline-primary border-0" for="l_boss">مدیر کل (دانیال)</label>
                </div>
                <div id="slugWrapper"><input type="text" id="l_slug" class="form-control mb-3 rounded-pill p-2 px-3" placeholder="شناسه شرکت (Slug)"></div>
                <input type="text" id="l_user" class="form-control mb-3 rounded-pill p-2 px-3" placeholder="نام کاربری">
                <input type="password" id="l_pass" class="form-control mb-4 rounded-pill p-2 px-3" placeholder="رمز عبور">
                <button onclick="handleLogin()" id="loginBtn" class="btn btn-primary w-100 fw-bold">ورود به پنل مدیریت</button>
            </div>
        </div>
    </div>

    <div id="superAdminSection" class="hidden">
        <div class="glass-card p-4 mb-4 border-top border-primary border-5">
            <h5 class="fw-bold mb-4 text-primary"><i class="bi bi-building-add me-2"></i> ثبت و پیکربندی شرکت جدید</h5>
            <div class="row g-3">
                <div class="col-md-3"><label class="small">نام شرکت</label><input type="text" id="c_name" class="form-control"></div>
                <div class="col-md-2"><label class="small">Slug یکتا</label><input type="text" id="c_slug" class="form-control"></div>
                <div class="col-md-2"><label class="small">سقف کاربر</label><input type="number" id="c_limit" class="form-control" value="10"></div>
                <div class="col-md-2"><label class="small">نام مدیر</label><input type="text" id="c_admin" class="form-control"></div>
                <div class="col-md-3"><label class="small">رمز مدیر</label><div class="input-group">
                    <input type="password" id="c_pass" class="form-control">
                    <button onclick="createCompany()" id="regBtn" class="btn btn-primary">ثبت نهایی</button>
                </div></div>
            </div>
        </div>
        <div class="row" id="companyGrid"></div>
    </div>

    <div id="userDashboard" class="hidden">
        <div class="row g-4">
            <div class="col-lg-8">
                <div class="glass-card p-4 mb-4">
                    <h5 class="fw-bold mb-3"><i class="bi bi-list-check me-2"></i> وظایف تخصیص یافته</h5>
                    <div id="taskArea" class="row g-3"></div>
                </div>
                <div class="glass-card p-4">
                    <h5 class="fw-bold mb-3"><i class="bi bi-chat-left-dots me-2"></i> گفتگوی سازمانی</h5>
                    <div id="chatMessages" class="chat-container mb-3"></div>
                    <div class="input-group shadow-sm rounded-pill overflow-hidden">
                        <input type="text" id="chatInput" class="form-control border-0 px-4" placeholder="پیام خود را اینجا بنویسید...">
                        <button onclick="sendChat()" class="btn btn-primary px-4">ارسال</button>
                    </div>
                </div>
            </div>
            <div class="col-lg-4" id="managerTools">
                <div class="glass-card p-4 sticky-top" style="top: 20px;">
                    <h5 class="fw-bold text-primary mb-3">ابزار مدیریتی</h5>
                    <label class="small">عنوان وظیفه</label>
                    <input type="text" id="t_title" class="form-control mb-3">
                    <label class="small">آیدی کاربر (Target ID)</label>
                    <input type="number" id="t_uid" class="form-control mb-4">
                    <button onclick="assignTask()" class="btn btn-primary w-100 mb-3">ثبت وظیفه برای پرسنل</button>
                    <hr>
                    <div id="staffList"></div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    let TOKEN = localStorage.getItem('token');
    let ROLE = localStorage.getItem('role');
    let WS = null;

    if(TOKEN) initApp();

    function updateLoginUI(type) {
        document.getElementById('slugWrapper').classList.toggle('hidden', type === 'boss');
    }

    async function handleLogin() {
        const btn = document.getElementById('loginBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال احراز هویت...';
        btn.disabled = true;

        const isBoss = document.getElementById('l_boss').checked;
        const res = await fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({
                isBoss,
                slug: document.getElementById('l_slug').value,
                user: document.getElementById('l_user').value,
                pass: document.getElementById('l_pass').value
            })
        });
        const data = await res.json();
        if(data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            location.reload();
        } else {
            alert(data.error || 'خطا در ورود');
            btn.innerHTML = 'ورود به پنل مدیریت';
            btn.disabled = false;
        }
    }

    async function createCompany() {
        const btn = document.getElementById('regBtn');
        btn.disabled = true;
        const res = await fetch('/api/super/company', {
            method: 'POST',
            headers: {'Authorization': 'Bearer '+TOKEN},
            body: JSON.stringify({
                name: document.getElementById('c_name').value,
                slug: document.getElementById('c_slug').value,
                limit: document.getElementById('c_limit').value,
                admin: document.getElementById('c_admin').value,
                pass: document.getElementById('c_pass').value
            })
        });
        const data = await res.json();
        if(res.ok) {
            alert('شرکت با موفقیت ثبت شد');
            loadCompanies();
        } else {
            alert('خطا: ' + data.error);
        }
        btn.disabled = false;
    }

    async function loadCompanies() {
        const res = await fetch('/api/super/companies', { headers: {'Authorization': 'Bearer '+TOKEN} });
        const list = await res.json();
        const grid = document.getElementById('companyGrid');
        grid.innerHTML = '';
        list.forEach(c => {
            grid.innerHTML += \`
                <div class="col-md-4 mb-3">
                    <div class="glass-card p-3 h-100 border-start border-info border-4">
                        <h6 class="fw-bold mb-1">\${c.name}</h6>
                        <code class="text-primary small">/\${c.slug}</code>
                        <div class="mt-2 small text-muted">محدودیت کاربر: \${c.user_limit}</div>
                    </div>
                </div>\`;
        });
    }

    function initApp() {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('mainNav').classList.remove('hidden');
        if(ROLE === 'superadmin') {
            document.getElementById('superAdminSection').classList.remove('hidden');
            loadCompanies();
        } else {
            document.getElementById('userDashboard').classList.remove('hidden');
            if(ROLE !== 'admin') document.getElementById('managerTools').classList.add('hidden');
            loadTasks();
            connectChat();
        }
    }

    function connectChat() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        WS = new WebSocket(\`\${proto}://\${location.host}/api/chat/ws?token=\${TOKEN}\`);
        WS.onmessage = e => {
            const m = JSON.parse(e.data);
            const box = document.getElementById('chatMessages');
            box.innerHTML += \`<div class="mb-2 p-2 bg-light rounded-3"><b>\${m.user}:</b> \${m.text}</div>\`;
            box.scrollTop = box.scrollHeight;
        };
    }

    function sendChat() {
        const input = document.getElementById('chatInput');
        if(!input.value) return;
        WS.send(JSON.stringify({ text: input.value }));
        input.value = '';
    }

    async function loadTasks() {
        const res = await fetch('/api/tasks', { headers: {'Authorization': 'Bearer '+TOKEN} });
        const tasks = await res.json();
        const area = document.getElementById('taskArea');
        area.innerHTML = tasks.length ? '' : '<div class="text-center py-5 opacity-50">تسک فعالی وجود ندارد</div>';
        tasks.forEach(t => {
            area.innerHTML += \`
                <div class="col-md-6">
                    <div class="glass-card p-3 task-card shadow-sm">
                        <div class="fw-bold">\${t.title}</div>
                        <div class="small text-muted mt-2">وضعیت: \${t.status}</div>
                    </div>
                </div>\`;
        });
    }

    function logout() { localStorage.clear(); location.reload(); }
</script>
</body>
</html>
`;

// --- 2. BACKEND API & LOGIC ---

export class ChatRoom extends DurableObject {
  sessions: Set<WebSocket> = new Set();
  async fetch(request: Request) {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sessions.add(server);
    server.addEventListener("message", msg => {
      this.sessions.forEach(s => {
        try { s.send(msg.data); } catch { this.sessions.delete(s); }
      });
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

app.get('/', (c) => c.html(HTML_TEMPLATE));

app.post('/api/login', async (c) => {
  const { isBoss, slug, user, pass } = await c.req.json();
  
  if (isBoss) {
    if (user === c.env.ADMIN_USER && pass === c.env.ADMIN_PASS) {
      const token = await sign({ role: 'superadmin' }, c.env.JWT_SECRET);
      return c.json({ token, role: 'superadmin' });
    }
    return c.json({ error: 'نام کاربری یا رمز مدیر کل اشتباه است' }, 401);
  }

  const company = await c.env.DB.prepare("SELECT * FROM companies WHERE slug = ?").bind(slug).first();
  if (!company) return c.json({ error: 'این شرکت در سامانه ثبت نشده است' }, 404);

  const dbUser = await c.env.DB.prepare("SELECT * FROM users WHERE company_id = ? AND username = ? AND password = ?").bind(company.id, user, pass).first();
  if (!dbUser) return c.json({ error: 'نام کاربری یا رمز عبور اشتباه است' }, 401);

  const token = await sign({ sub: dbUser.id, role: dbUser.role, companyId: company.id, username: dbUser.username }, c.env.JWT_SECRET);
  return c.json({ token, role: dbUser.role });
});

// Auth Middleware
app.use('/api/*', async (c, next) => {
  if (c.req.path.includes('/chat/ws')) return next();
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    c.set('user', await verify(token, c.env.JWT_SECRET));
    await next();
  } catch { return c.json({ error: 'Token Invalid' }, 403); }
});

app.post('/api/super/company', async (c) => {
  const user = c.get('user');
  if (user.role !== 'superadmin') return c.json({ error: 'عدم دسترسی' }, 403);
  
  const { name, slug, limit, admin, pass } = await c.req.json();
  try {
    const res = await c.env.DB.prepare(
        "INSERT INTO companies (name, slug, user_limit) VALUES (?, ?, ?) RETURNING id"
    ).bind(name, slug, parseInt(limit)).first();
    
    if (!res) throw new Error('خطا در دیتابیس');
    
    await c.env.DB.prepare(
        "INSERT INTO users (company_id, username, password, role) VALUES (?, ?, ?, 'admin')"
    ).bind(res.id, admin, pass).run();
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: 'شناسه تکراری است یا خطایی رخ داد: ' + e.message }, 500);
  }
});

app.get('/api/super/companies', async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM companies ORDER BY id DESC").all();
  return c.json(results);
});

app.get('/api/tasks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare("SELECT * FROM tasks WHERE company_id = ?").bind(user.companyId).all();
  return c.json(results);
});

app.get('/api/chat/ws', async (c) => {
  const token = c.req.query('token');
  try {
    const payload = await verify(token || '', c.env.JWT_SECRET);
    const id = c.env.CHAT_ROOM.idFromName("room_" + payload.companyId);
    return c.env.CHAT_ROOM.get(id).fetch(c.req.raw);
  } catch { return c.text("Forbidden", 403); }
});

export default app;
