import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { DurableObject } from "cloudflare:workers";

type Bindings = {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  ADMIN_USER: string; // مدیر کل سامانه
  ADMIN_PASS: string; // رمز مدیر کل
};

// --- FRONTEND UI ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>پنل مدیریت متمرکز سازمانی</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css">
    <style>
        body { background: #f4f7f6; font-family: Tahoma, sans-serif; }
        .glass { background: white; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: none; }
        .hidden { display: none !important; }
        .chat-area { height: 350px; overflow-y: auto; background: #fafafa; border-radius: 10px; padding: 10px; }
        .navbar-custom { background: #2c3e50; color: white; }
    </style>
</head>
<body>

<nav class="navbar navbar-custom mb-4 hidden" id="mainNav">
  <div class="container">
    <span id="brandName" class="navbar-brand fw-bold">مدیریت کل سیستم</span>
    <button class="btn btn-outline-light btn-sm" onclick="logout()">خروج</button>
  </div>
</nav>

<div class="container">
    <div id="loginSection" class="row justify-content-center mt-5">
        <div class="col-md-4">
            <div class="card glass p-4 text-center">
                <h4 class="mb-4">ورود به سیستم</h4>
                <div id="loginTypeToggle" class="mb-3 btn-group w-100">
                    <input type="radio" class="btn-check" name="ltype" id="l_staff" checked onchange="toggleLoginUI('staff')">
                    <label class="btn btn-outline-primary" for="l_staff">پرسنل/مدیر شرکت</label>
                    <input type="radio" class="btn-check" name="ltype" id="l_boss" onchange="toggleLoginUI('boss')">
                    <label class="btn btn-outline-danger" for="l_boss">مدیر کل (دانیال)</label>
                </div>
                <input type="text" id="l_slug" class="form-control mb-2" placeholder="شناسه شرکت">
                <input type="text" id="l_user" class="form-control mb-2" placeholder="نام کاربری">
                <input type="password" id="l_pass" class="form-control mb-3" placeholder="رمز عبور">
                <button onclick="handleLogin()" class="btn btn-primary w-100">ورود به پنل</button>
            </div>
        </div>
    </div>

    <div id="superAdminSection" class="hidden">
        <div class="card glass p-4 mb-4">
            <h5 class="fw-bold"><i class="bi bi-plus-circle"></i> ثبت شرکت و مدیر جدید</h5>
            <div class="row g-2 mt-2">
                <div class="col-md-3"><input type="text" id="c_name" class="form-control" placeholder="نام شرکت"></div>
                <div class="col-md-2"><input type="text" id="c_slug" class="form-control" placeholder="شناسه (Slug)"></div>
                <div class="col-md-2"><input type="number" id="c_limit" class="form-control" placeholder="سقف کاربر"></div>
                <div class="col-md-2"><input type="text" id="c_admin" class="form-control" placeholder="نام مدیر"></div>
                <div class="col-md-2"><input type="password" id="c_pass" class="form-control" placeholder="رمز مدیر"></div>
                <div class="col-md-1"><button onclick="createCompany()" class="btn btn-success w-100">ثبت</button></div>
            </div>
        </div>
        <div class="card glass p-4">
            <h6>لیست شرکت‌های فعال</h6>
            <div id="companyList" class="table-responsive"></div>
        </div>
    </div>

    <div id="userDashboard" class="hidden">
        <div class="row">
            <div class="col-md-8">
                <div class="card glass p-3 mb-3">
                    <h6 class="fw-bold">تسک‌های من/پرسنل</h6>
                    <div id="taskArea" class="row g-2"></div>
                </div>
                <div id="chatBox" class="card glass p-3">
                    <h6>چت داخلی سازمان</h6>
                    <div id="chatMessages" class="chat-area mb-2"></div>
                    <div class="input-group">
                        <input type="text" id="chatInput" class="form-control" placeholder="پیام...">
                        <button onclick="sendChat()" class="btn btn-primary">ارسال</button>
                    </div>
                </div>
            </div>
            <div class="col-md-4" id="managerPanel">
                <div class="card glass p-3 border-start border-primary border-4">
                    <h6 class="fw-bold text-primary">تخصیص وظیفه جدید</h6>
                    <input type="text" id="t_title" class="form-control mb-2" placeholder="عنوان">
                    <input type="number" id="t_uid" class="form-control mb-2" placeholder="ID کاربر">
                    <button onclick="assignTask()" class="btn btn-primary w-100 btn-sm">تایید</button>
                    <hr>
                    <h6>مدیریت دسترسی</h6>
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

    function toggleLoginUI(type) {
        document.getElementById('l_slug').classList.toggle('hidden', type === 'boss');
    }

    async function handleLogin() {
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
        } else alert(data.error);
    }

    function initApp() {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('mainNav').classList.remove('hidden');
        if(ROLE === 'superadmin') {
            document.getElementById('superAdminSection').classList.remove('hidden');
            loadCompanies();
        } else {
            document.getElementById('userDashboard').classList.remove('hidden');
            if(ROLE !== 'admin') document.getElementById('managerPanel').classList.add('hidden');
            loadTasks();
            connectChat();
            if(ROLE === 'admin') loadStaff();
        }
    }

    async function createCompany() {
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
        if(res.ok) { alert('شرکت ایجاد شد'); loadCompanies(); }
    }

    async function loadCompanies() {
        const res = await fetch('/api/super/companies', { headers: {'Authorization': 'Bearer '+TOKEN} });
        const list = await res.json();
        let html = '<table class="table"><tr><th>نام</th><th>Slug</th><th>محدودیت</th></tr>';
        list.forEach(c => html += \`<tr><td>\${c.name}</td><td>\${c.slug}</td><td>\${c.user_limit}</td></tr>\`);
        document.getElementById('companyList').innerHTML = html + '</table>';
    }

    async function loadTasks() {
        const res = await fetch('/api/tasks', { headers: {'Authorization': 'Bearer '+TOKEN} });
        const tasks = await res.json();
        const area = document.getElementById('taskArea');
        area.innerHTML = '';
        tasks.forEach(t => {
            area.innerHTML += \`<div class="col-6"><div class="card p-2 shadow-sm">\${t.title} <br> <small>\${t.status}</small></div></div>\`;
        });
    }

    function connectChat() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        WS = new WebSocket(\`\${proto}://\${location.host}/api/chat/ws?token=\${TOKEN}\`);
        WS.onmessage = e => {
            const m = JSON.parse(e.data);
            const box = document.getElementById('chatMessages');
            box.innerHTML += \`<div><b>\${m.user}:</b> \${m.text}</div>\`;
            box.scrollTop = box.scrollHeight;
        };
    }

    function sendChat() {
        WS.send(JSON.stringify({ text: document.getElementById('chatInput').value }));
        document.getElementById('chatInput').value = '';
    }

    function logout() { localStorage.clear(); location.reload(); }
</script>
</body>
</html>
`;

// --- BACKEND ---

export class ChatRoom extends DurableObject {
  sessions: Set<WebSocket> = new Set();
  async fetch(request: Request) {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sessions.add(server);
    server.addEventListener("message", msg => {
      this.sessions.forEach(s => s.send(msg.data));
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
    return c.json({ error: 'دسترسی غیرمجاز' }, 401);
  }

  const company = await c.env.DB.prepare("SELECT * FROM companies WHERE slug = ?").bind(slug).first();
  if (!company) return c.json({ error: 'شرکت یافت نشد' }, 404);

  const dbUser = await c.env.DB.prepare("SELECT * FROM users WHERE company_id = ? AND username = ? AND password = ?").bind(company.id, user, pass).first();
  if (!dbUser) return c.json({ error: 'خطا در ورود' }, 401);

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
  } catch { return c.json({ error: 'Token Error' }, 403); }
});

// Super Admin APIs
app.post('/api/super/company', async (c) => {
  if (c.get('user').role !== 'superadmin') return c.json({ error: 'Forbidden' }, 403);
  const { name, slug, limit, admin, pass } = await c.req.json();
  const res = await c.env.DB.prepare("INSERT INTO companies (name, slug, user_limit) VALUES (?, ?, ?) RETURNING id").bind(name, slug, limit).first();
  await c.env.DB.prepare("INSERT INTO users (company_id, username, password, role) VALUES (?, ?, ?, 'admin')").bind(res.id, admin, pass).run();
  return c.json({ success: true });
});

app.get('/api/super/companies', async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM companies").all();
  return c.json(results);
});

// User APIs
app.get('/api/tasks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare("SELECT * FROM tasks WHERE company_id = ?").bind(user.companyId).all();
  return c.json(results);
});

app.get('/api/chat/ws', async (c) => {
  const token = c.req.query('token');
  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    const id = c.env.CHAT_ROOM.idFromName("room_" + payload.companyId);
    return c.env.CHAT_ROOM.get(id).fetch(c.req.raw);
  } catch { return c.text("Error", 403); }
});

export default app;
