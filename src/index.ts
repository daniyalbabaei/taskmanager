/**
 * Advanced Multi-tenant Task Manager
 * Backend: Hono + D1 + Durable Objects (Isolated Chat)
 * Frontend: Modern Persian UI + Admin Moderation
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { DurableObject } from "cloudflare:workers";

type Bindings = {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
};

// --- 1. MODERN FRONTEND UI ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>پنل هوشمند مدیریت سازمانی</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css">
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <style>
        :root { --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        body { background: #f0f2f5; font-family: Vazirmatn, sans-serif; color: #333; }
        .glass-card { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); border: none; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
        .nav-pills .nav-link.active { background: var(--primary-gradient); }
        .chat-box { height: 400px; overflow-y: auto; background: #fff; padding: 15px; border-radius: 10px; border: 1px solid #eee; display: flex; flex-direction: column; }
        .msg { margin-bottom: 10px; padding: 8px 15px; border-radius: 15px; max-width: 80%; }
        .msg-me { background: #e3f2fd; align-self: flex-start; border-bottom-right-radius: 0; }
        .msg-others { background: #f1f0f0; align-self: flex-end; border-bottom-left-radius: 0; }
        .hidden { display: none !important; }
        .navbar { background: var(--primary-gradient) !important; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .badge-status { font-size: 0.75rem; padding: 5px 10px; }
    </style>
</head>
<body>

<nav class="navbar navbar-dark mb-4 hidden" id="mainNav">
  <div class="container">
    <span class="navbar-brand fw-bold"><i class="bi bi-grid-1x2-fill me-2"></i> پیشخوان مدیریت</span>
    <div class="d-flex align-items-center">
        <span id="userDisplay" class="text-white me-3 small"></span>
        <button class="btn btn-light btn-sm rounded-pill px-3" onclick="logout()">خروج</button>
    </div>
  </div>
</nav>

<div class="container">
    <div id="loginSection" class="row justify-content-center mt-5">
        <div class="col-lg-4 col-md-6">
            <div class="card glass-card p-4">
                <div class="text-center mb-4">
                    <div class="display-6 text-primary mb-2"><i class="bi bi-shield-lock-fill"></i></div>
                    <h4 class="fw-bold">ورود به سامانه</h4>
                </div>
                <form onsubmit="handleLogin(event)">
                    <div class="mb-3">
                        <label class="form-label small">شناسه شرکت (Slug)</label>
                        <input type="text" id="companySlug" class="form-control rounded-pill" placeholder="مثلا: petro-co" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small">نام کاربری</label>
                        <input type="text" id="username" class="form-control rounded-pill" required>
                    </div>
                    <div class="mb-4">
                        <label class="form-label small">رمز عبور</label>
                        <input type="password" id="password" class="form-control rounded-pill" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100 rounded-pill py-2 shadow-sm">ورود امن</button>
                </form>
                <div id="superAdminLink" class="text-center mt-3">
                    <button class="btn btn-link btn-sm text-muted text-decoration-none" onclick="toggleRegister()">ثبت شرکت جدید (ویژه مدیریت کل)</button>
                </div>
            </div>
        </div>
    </div>

    <div id="registerSection" class="row justify-content-center mt-5 hidden">
        <div class="col-lg-5">
            <div class="card glass-card p-4 border-top border-success border-5">
                <h5 class="fw-bold mb-3">تعریف سازمان جدید</h5>
                <form onsubmit="handleRegister(event)">
                    <input type="text" id="regName" class="form-control mb-3" placeholder="نام رسمی شرکت" required>
                    <input type="text" id="regSlug" class="form-control mb-3" placeholder="شناسه لاتین (Slug)" required>
                    <input type="text" id="regAdmin" class="form-control mb-3" placeholder="نام کاربری مدیر ارشد" required>
                    <input type="password" id="regPass" class="form-control mb-3" placeholder="رمز عبور مدیر" required>
                    <button type="submit" class="btn btn-success w-100 rounded-pill">تأیید و ایجاد دیتابیس شرکت</button>
                </form>
                <button class="btn btn-link w-100 mt-2 text-decoration-none" onclick="toggleRegister()">بازگشت</button>
            </div>
        </div>
    </div>

    <div id="dashboardSection" class="hidden">
        <div class="row">
            <div class="col-md-3 mb-4">
                <div class="card glass-card p-2">
                    <div class="nav flex-column nav-pills" id="v-pills-tab" role="tablist">
                        <button class="nav-link active mb-2 text-start" data-bs-toggle="pill" data-bs-target="#tasks"><i class="bi bi-list-task me-2"></i> لیست وظایف</button>
                        <button class="nav-link mb-2 text-start" data-bs-toggle="pill" data-bs-target="#chat"><i class="bi bi-chat-dots me-2"></i> گفتگو سازمانی</button>
                        <button class="nav-link mb-2 text-start" id="adminTabBtn" data-bs-toggle="pill" data-bs-target="#admin"><i class="bi bi-person-gear me-2"></i> پنل مدیریت</button>
                    </div>
                </div>
            </div>
            
            <div class="col-md-9">
                <div class="tab-content glass-card p-4">
                    <div class="tab-pane fade show active" id="tasks">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <h5 class="fw-bold m-0">وظایف جاری</h5>
                            <button class="btn btn-outline-primary btn-sm rounded-pill" onclick="loadTasks()"><i class="bi bi-arrow-clockwise"></i></button>
                        </div>
                        <div class="row g-3" id="taskListArea"></div>
                    </div>

                    <div class="tab-pane fade" id="chat">
                        <div class="card border-0">
                            <div class="chat-box shadow-inner mb-3" id="chatMessages"></div>
                            <div id="muteStatus" class="alert alert-warning py-2 small hidden text-center">شما توسط مدیر بی صدا شده‌اید.</div>
                            <div class="input-group" id="chatInputArea">
                                <input type="text" id="chatInput" class="form-control border-0 bg-light" placeholder="پیام شما...">
                                <button class="btn btn-primary px-4" onclick="sendChat()"><i class="bi bi-send"></i></button>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="admin">
                        <h6 class="fw-bold mb-3 text-primary">تخصیص تسک جدید</h6>
                        <form onsubmit="createTask(event)" class="row g-2 mb-4">
                            <div class="col-md-4"><input type="text" id="taskTitle" class="form-control form-control-sm" placeholder="عنوان فعالیت" required></div>
                            <div class="col-md-3"><input type="number" id="taskUser" class="form-control form-control-sm" placeholder="آیدی کاربر" required></div>
                            <div class="col-md-3"><input type="datetime-local" id="taskDate" class="form-control form-control-sm" required></div>
                            <div class="col-md-2"><button type="submit" class="btn btn-success btn-sm w-100">ارسال</button></div>
                        </form>
                        <hr>
                        <h6 class="fw-bold mb-3">مدیریت کاربران و دسترسی چت</h6>
                        <div class="table-responsive">
                            <table class="table table-sm align-middle small">
                                <thead class="table-light"><tr><th>کاربر</th><th>وضعیت</th><th>عملیات</th></tr></thead>
                                <tbody id="userManagementArea"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script>
    let TOKEN = localStorage.getItem('token');
    let ROLE = localStorage.getItem('role');
    let IS_MUTED = false;
    let WS = null;

    if (TOKEN) showDashboard();

    function toggleRegister() {
        document.getElementById('loginSection').classList.toggle('hidden');
        document.getElementById('registerSection').classList.toggle('hidden');
    }

    async function handleLogin(e) {
        e.preventDefault();
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companySlug: document.getElementById('companySlug').value,
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            })
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('username', document.getElementById('username').value);
            TOKEN = data.token; ROLE = data.role; IS_MUTED = data.isMuted;
            showDashboard();
        } else alert(data.error);
    }

    async function handleRegister(e) {
        e.preventDefault();
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: document.getElementById('regName').value,
                companySlug: document.getElementById('regSlug').value,
                adminUser: document.getElementById('regAdmin').value,
                password: document.getElementById('regPass').value
            })
        });
        const data = await res.json();
        if(data.success) { alert('شرکت با موفقیت ثبت شد.'); toggleRegister(); }
        else alert(data.error);
    }

    function showDashboard() {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('mainNav').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        document.getElementById('userDisplay').innerText = localStorage.getItem('username') + ' (' + (ROLE === 'admin' ? 'مدیر' : 'کارمند') + ')';
        
        if (ROLE === 'employee') document.getElementById('adminTabBtn').classList.add('hidden');
        if (IS_MUTED) {
            document.getElementById('chatInputArea').classList.add('hidden');
            document.getElementById('muteStatus').classList.remove('hidden');
        }

        loadTasks();
        connectChat();
        if (ROLE === 'admin') loadAdminData();
    }

    async function loadTasks() {
        const res = await fetch('/api/tasks', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
        const tasks = await res.json();
        const area = document.getElementById('taskListArea');
        area.innerHTML = tasks.length ? '' : '<p class="text-center text-muted py-5">تسک فعالی ندارید.</p>';
        
        tasks.forEach(t => {
            let actionBtn = '';
            if (t.status === 'pending' && ROLE === 'employee') {
                actionBtn = \`<button class="btn btn-sm btn-primary rounded-pill w-100" onclick="updateTask('\${t.id}', 'complete')">تکمیل کردم</button>\`;
            } else if (t.status === 'done' && ROLE === 'admin') {
                actionBtn = \`<button class="btn btn-sm btn-success rounded-pill w-100" onclick="updateTask('\${t.id}', 'approve')">تأیید نهایی</button>\`;
            }

            const statusClass = t.status === 'approved' ? 'bg-success' : (t.status === 'done' ? 'bg-warning text-dark' : 'bg-secondary');
            
            area.innerHTML += \`
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between mb-2">
                                <span class="badge \${statusClass} badge-status rounded-pill">\${t.status}</span>
                                <small class="text-muted">ID: \${t.id}</small>
                            </div>
                            <h6 class="fw-bold">\${t.title}</h6>
                            <p class="small text-muted mb-3"><i class="bi bi-calendar-event me-1"></i> \${new Date(t.deadline).toLocaleDateString('fa-IR')}</p>
                            \${actionBtn}
                        </div>
                    </div>
                </div>
            \`;
        });
    }

    async function updateTask(id, action) {
        await fetch(\`/api/tasks/\${id}/\${action}\`, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + TOKEN } });
        loadTasks();
    }

    async function createTask(e) {
        e.preventDefault();
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: document.getElementById('taskTitle').value,
                assignedToId: document.getElementById('taskUser').value,
                deadline: document.getElementById('taskDate').value
            })
        });
        if(res.ok) { alert('تسک اختصاص یافت'); loadTasks(); }
    }

    async function loadAdminData() {
        const res = await fetch('/api/reports', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
        const data = await res.json();
        const area = document.getElementById('userManagementArea');
        area.innerHTML = '';
        data.users.forEach(u => {
            const muteBtn = u.is_muted 
                ? \`<button class="btn btn-link btn-sm text-success" onclick="toggleMute(\${u.id}, 0)">رفع سکوت</button>\`
                : \`<button class="btn btn-link btn-sm text-danger" onclick="toggleMute(\${u.id}, 1)">بی‌صدا کردن</button>\`;
            area.innerHTML += \`<tr><td>\${u.username} (ID: \${u.id})</td><td>\${u.role}</td><td>\${u.role !== 'admin' ? muteBtn : '-'}</td></tr>\`;
        });
    }

    async function toggleMute(uid, val) {
        await fetch(\`/api/admin/mute/\${uid}/\${val}\`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN } });
        loadAdminData();
    }

    function connectChat() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        WS = new WebSocket(\`\${proto}://\${location.host}/api/chat/ws?token=\${TOKEN}\`);
        
        WS.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            const box = document.getElementById('chatMessages');
            const isMe = msg.user === localStorage.getItem('username');
            box.innerHTML += \`
                <div class="msg \${isMe ? 'msg-me' : 'msg-others'} shadow-sm">
                    <div class="fw-bold small">\${msg.user}</div>
                    <div>\${msg.text}</div>
                    <div class="text-muted" style="font-size:0.6rem">\${new Date(msg.time).toLocaleTimeString('fa-IR')}</div>
                </div>\`;
            box.scrollTop = box.scrollHeight;
        };
    }

    function sendChat() {
        const input = document.getElementById('chatInput');
        if (!input.value || IS_MUTED) return;
        WS.send(JSON.stringify({ user: localStorage.getItem('username'), text: input.value }));
        input.value = '';
    }

    function logout() { localStorage.clear(); location.reload(); }
</script>
</body>
</html>
`;

// --- 2. BACKEND LOGIC (Isolated Chat & Moderation) ---

// Durable Object for Chat - Now Company-Isolated
export class ChatRoom extends DurableObject {
  sessions: Set<WebSocket> = new Set();

  async fetch(request: Request) {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string);
      const broadcastMsg = JSON.stringify({
        user: data.user,
        text: data.text,
        time: new Date().toISOString()
      });
      this.sessions.forEach(s => {
        try { s.send(broadcastMsg); } catch { this.sessions.delete(s); }
      });
    });

    server.addEventListener("close", () => this.sessions.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

app.get('/', (c) => c.html(HTML_TEMPLATE));

// API: Register (Ideally restricted to SuperAdmin via Secret Header/IP)
app.post('/api/register', async (c) => {
  const { companyName, companySlug, adminUser, password } = await c.req.json();
  try {
    const res = await c.env.DB.prepare("INSERT INTO companies (name, slug) VALUES (?, ?) RETURNING id").bind(companyName, companySlug).first();
    if (!res) throw new Error('DB Error');
    await c.env.DB.prepare("INSERT INTO users (company_id, username, password, role) VALUES (?, ?, ?, 'admin')").bind(res.id, adminUser, password).run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'خطا در ثبت شرکت (شناسه تکراری است)' }, 400);
  }
});

app.post('/api/login', async (c) => {
  const { companySlug, username, password } = await c.req.json();
  const company = await c.env.DB.prepare("SELECT * FROM companies WHERE slug = ?").bind(companySlug).first();
  if (!company) return c.json({ error: 'شرکت یافت نشد' }, 404);

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE company_id = ? AND username = ? AND password = ?").bind(company.id, username, password).first();
  if (!user) return c.json({ error: 'نام کاربری یا رمز اشتباه است' }, 401);

  const token = await sign({ sub: user.id, role: user.role, companyId: company.id, muted: !!user.is_muted }, c.env.JWT_SECRET);
  return c.json({ token, role: user.role, isMuted: !!user.is_muted });
});

// Auth Middleware
app.use('/api/*', async (c, next) => {
  if (c.req.path.includes('/chat/ws')) return next();
  const auth = c.req.header('Authorization');
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verify(auth.split(' ')[1], c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch { return c.json({ error: 'Invalid Token' }, 403); }
});

app.get('/api/tasks', async (c) => {
  const user = c.get('user');
  let q = "SELECT * FROM tasks WHERE company_id = ?";
  let p = [user.companyId];
  if (user.role === 'employee') { q += " AND assigned_to = ?"; p.push(user.sub); }
  const { results } = await c.env.DB.prepare(q).bind(...p).all();
  return c.json(results);
});

app.post('/api/tasks', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'فقط مدیر شرکت اجازه دارد' }, 403);
  const { title, assignedToId, deadline } = await c.req.json();
  await c.env.DB.prepare("INSERT INTO tasks (company_id, title, assigned_to, supervisor_id, deadline) VALUES (?, ?, ?, ?, ?)").bind(user.companyId, title, assignedToId, user.sub, deadline).run();
  return c.json({ success: true });
});

app.put('/api/tasks/:id/:action', async (c) => {
  const user = c.get('user');
  const { id, action } = c.req.param();
  if (action === 'complete') {
    await c.env.DB.prepare("UPDATE tasks SET status = 'done' WHERE id = ? AND assigned_to = ?").bind(id, user.sub).run();
  } else if (action === 'approve' && user.role === 'admin') {
    await c.env.DB.prepare("UPDATE tasks SET status = 'approved' WHERE id = ? AND company_id = ?").bind(id, user.companyId).run();
  }
  return c.json({ success: true });
});

// Admin Moderation: Mute/Unmute
app.post('/api/admin/mute/:userId/:value', async (c) => {
    const user = c.get('user');
    if (user.role !== 'admin') return c.json({ error: 'Access Denied' }, 403);
    const { userId, value } = c.req.param();
    await c.env.DB.prepare("UPDATE users SET is_muted = ? WHERE id = ? AND company_id = ?").bind(parseInt(value), userId, user.companyId).run();
    return c.json({ success: true });
});

app.get('/api/reports', async (c) => {
    const user = c.get('user');
    if (user.role !== 'admin') return c.json({ error: 'Access Denied' }, 403);
    const users = await c.env.DB.prepare("SELECT id, username, role, is_muted FROM users WHERE company_id = ?").bind(user.companyId).all();
    return c.json({ users: users.results });
});

// Chat Entry - UNIQUE ROOM PER COMPANY
app.get('/api/chat/ws', async (c) => {
    const token = c.req.query('token');
    try {
        const payload = await verify(token || '', c.env.JWT_SECRET);
        // Using companyId to isolate rooms
        const id = c.env.CHAT_ROOM.idFromName("company_" + payload.companyId);
        const stub = c.env.CHAT_ROOM.get(id);
        return stub.fetch(c.req.raw);
    } catch { return c.text("Unauthorized", 403); }
});

export default app;
