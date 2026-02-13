/**
 * Ultimate Single-File Task Manager for Cloudflare Workers
 * Backend: Hono + D1 + Durable Objects
 * Frontend: Embedded HTML + Bootstrap 5
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { DurableObject } from "cloudflare:workers";

// --- Types & Config ---
type Bindings = {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
};

// --- 1. FRONTEND UI (Embedded HTML/JS) ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>سامانه مدیریت تسک و چت سازمانی</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <style>
        body { background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .chat-box { height: 300px; overflow-y: auto; border: 1px solid #dee2e6; background: #fff; padding: 10px; border-radius: 5px; }
        .hidden { display: none !important; }
        .task-card { transition: transform 0.2s; }
        .task-card:hover { transform: translateY(-2px); shadow: 0 .5rem 1rem rgba(0,0,0,.15)!important; }
    </style>
</head>
<body>

<nav class="navbar navbar-expand-lg navbar-dark bg-primary mb-4 hidden" id="mainNav">
  <div class="container">
    <a class="navbar-brand" href="#"><i class="bi bi-building-check"></i> تسک منیجر</a>
    <button class="btn btn-outline-light btn-sm" onclick="logout()">خروج</button>
  </div>
</nav>

<div class="container">
    
    <div id="loginSection" class="row justify-content-center mt-5">
        <div class="col-md-5">
            <div class="card shadow">
                <div class="card-header bg-primary text-white text-center">
                    <h4>ورود به پنل</h4>
                </div>
                <div class="card-body">
                    <form onsubmit="handleLogin(event)">
                        <div class="mb-3">
                            <label>شناسه شرکت (Slug)</label>
                            <input type="text" id="companySlug" class="form-control" placeholder="مثلا: petro-tajhiz" required>
                        </div>
                        <div class="mb-3">
                            <label>نام کاربری</label>
                            <input type="text" id="username" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label>رمز عبور</label>
                            <input type="password" id="password" class="form-control" required>
                        </div>
                        <button type="submit" class="btn btn-primary w-100">ورود و ثبت لوکیشن</button>
                    </form>
                    <hr>
                    <button class="btn btn-sm btn-outline-secondary w-100" onclick="toggleRegister()">ثبت شرکت جدید</button>
                </div>
            </div>
        </div>
    </div>

    <div id="registerSection" class="row justify-content-center mt-5 hidden">
        <div class="col-md-5">
            <div class="card shadow border-success">
                <div class="card-header bg-success text-white">ثبت شرکت جدید</div>
                <div class="card-body">
                    <form onsubmit="handleRegister(event)">
                        <input type="text" id="regName" class="form-control mb-2" placeholder="نام شرکت" required>
                        <input type="text" id="regSlug" class="form-control mb-2" placeholder="شناسه یکتا (Slug)" required>
                        <input type="text" id="regAdmin" class="form-control mb-2" placeholder="نام کاربری مدیر" required>
                        <input type="password" id="regPass" class="form-control mb-2" placeholder="رمز عبور" required>
                        <button type="submit" class="btn btn-success w-100">ثبت نام</button>
                    </form>
                    <button class="btn btn-link w-100 mt-2" onclick="toggleRegister()">بازگشت به ورود</button>
                </div>
            </div>
        </div>
    </div>

    <div id="dashboardSection" class="hidden">
        <ul class="nav nav-tabs mb-3" id="myTab" role="tablist">
            <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tasks">تسک‌ها</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#chat">چت گروهی</button></li>
            <li class="nav-item" id="adminTabBtn"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#admin">مدیریت (ناظر)</button></li>
        </ul>

        <div class="tab-content">
            <div class="tab-pane fade show active" id="tasks">
                <div class="row" id="taskListArea">
                    </div>
            </div>

            <div class="tab-pane fade" id="chat">
                <div class="row">
                    <div class="col-md-8 mx-auto">
                        <div class="card shadow-sm">
                            <div class="card-header bg-info text-white">گفتگوی آنلاین</div>
                            <div class="card-body">
                                <div id="chatMessages" class="chat-box mb-3"></div>
                                <div class="input-group">
                                    <input type="text" id="chatInput" class="form-control" placeholder="پیام خود را بنویسید...">
                                    <button class="btn btn-primary" onclick="sendChat()">ارسال</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tab-pane fade" id="admin">
                <div class="card mb-3">
                    <div class="card-header">تعریف تسک جدید</div>
                    <div class="card-body">
                        <form onsubmit="createTask(event)" class="row g-3">
                            <div class="col-md-4"><input type="text" id="taskTitle" class="form-control" placeholder="عنوان تسک" required></div>
                            <div class="col-md-4"><input type="number" id="taskUser" class="form-control" placeholder="ID کارمند" required></div>
                            <div class="col-md-4"><input type="datetime-local" id="taskDate" class="form-control" required></div>
                            <div class="col-12"><button type="submit" class="btn btn-success">اختصاص تسک</button></div>
                        </form>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">گزارش عملکرد</div>
                    <div class="card-body" id="reportArea">Loading...</div>
                </div>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
    let TOKEN = localStorage.getItem('token');
    let ROLE = localStorage.getItem('role');
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
            TOKEN = data.token;
            ROLE = data.role;
            alert('ورود موفق! لوکیشن شما ثبت شد: ' + data.location.city);
            showDashboard();
        } else {
            alert('خطا: ' + data.error);
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const res = await fetch('/api/register', {
            method: 'POST',
            body: JSON.stringify({
                companyName: document.getElementById('regName').value,
                companySlug: document.getElementById('regSlug').value,
                adminUser: document.getElementById('regAdmin').value,
                password: document.getElementById('regPass').value
            })
        });
        const data = await res.json();
        alert(data.message || data.error);
        if(data.success) toggleRegister();
    }

    function showDashboard() {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('mainNav').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        
        if (ROLE === 'employee') document.getElementById('adminTabBtn').classList.add('hidden');
        
        loadTasks();
        connectChat();
        if (ROLE !== 'employee') loadReports();
    }

    function logout() {
        localStorage.clear();
        location.reload();
    }

    async function loadTasks() {
        const res = await fetch('/api/tasks', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
        const tasks = await res.json();
        const area = document.getElementById('taskListArea');
        area.innerHTML = '';
        
        tasks.forEach(t => {
            let actionBtn = '';
            if (t.status === 'pending' && ROLE === 'employee') {
                actionBtn = \`<button class="btn btn-sm btn-primary" onclick="updateTask('\${t.id}', 'complete')">انجام شد</button>\`;
            } else if (t.status === 'done' && ROLE !== 'employee') {
                actionBtn = \`<button class="btn btn-sm btn-success" onclick="updateTask('\${t.id}', 'approve')">تأیید نهایی</button>\`;
            }

            let statusBadge = t.status === 'approved' ? 'bg-success' : (t.status === 'done' ? 'bg-warning' : 'bg-secondary');

            area.innerHTML += \`
                <div class="col-md-4 mb-3">
                    <div class="card task-card shadow-sm h-100">
                        <div class="card-body">
                            <h5 class="card-title">\${t.title}</h5>
                            <p class="card-text small text-muted">مهلت: \${new Date(t.deadline).toLocaleString('fa-IR')}</p>
                            <span class="badge \${statusBadge} mb-2">\${t.status}</span>
                            <div class="mt-2">\${actionBtn}</div>
                        </div>
                    </div>
                </div>
            \`;
        });
    }

    async function updateTask(id, action) {
        await fetch(\`/api/tasks/\${id}/\${action}\`, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + TOKEN } });
        loadTasks();
        if(ROLE !== 'employee') loadReports();
    }

    async function createTask(e) {
        e.preventDefault();
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + TOKEN },
            body: JSON.stringify({
                title: document.getElementById('taskTitle').value,
                assignedToId: document.getElementById('taskUser').value,
                deadline: document.getElementById('taskDate').value
            })
        });
        alert('تسک ایجاد شد');
        loadTasks();
    }

    async function loadReports() {
        const res = await fetch('/api/reports', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
        const data = await res.json();
        document.getElementById('reportArea').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    }

    function connectChat() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        WS = new WebSocket(\`\${proto}://\${location.host}/api/chat/ws?token=\${TOKEN}\`);
        
        WS.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            const box = document.getElementById('chatMessages');
            box.innerHTML += \`<div><strong>\${msg.user}:</strong> \${msg.text} <span class="text-muted small" style="font-size:0.7em">\${new Date(msg.time).toLocaleTimeString()}</span></div>\`;
            box.scrollTop = box.scrollHeight;
        };
    }

    function sendChat() {
        const input = document.getElementById('chatInput');
        if (!input.value) return;
        const user = localStorage.getItem('username');
        WS.send(JSON.stringify({ user, text: input.value }));
        input.value = '';
    }
</script>
</body>
</html>
`;

// --- 2. BACKEND LOGIC ---

// Chat System (Durable Object)
export class ChatRoom extends DurableObject {
  sessions: Set<WebSocket>;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sessions = new Set();
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string);
        const broadcastMsg = JSON.stringify({
          user: data.user,
          text: data.text,
          time: new Date().toISOString()
        });
        this.sessions.forEach((s) => {
            try { s.send(broadcastMsg); } catch { this.sessions.delete(s); }
        });
      } catch(e) {}
    });

    server.addEventListener("close", () => this.sessions.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}

// Main App
const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

// Serve HTML Frontend
app.get('/', (c) => c.html(HTML_TEMPLATE));

// API: Register
app.post('/api/register', async (c) => {
  const { companyName, companySlug, adminUser, password } = await c.req.json();
  try {
    const res = await c.env.DB.prepare("INSERT INTO companies (name, slug) VALUES (?, ?) RETURNING id").bind(companyName, companySlug).first();
    if (!res) throw new Error('DB Error');
    await c.env.DB.prepare("INSERT INTO users (company_id, username, password, role) VALUES (?, ?, ?, 'admin')").bind(res.id, adminUser, password).run();
    return c.json({ success: true, message: 'شرکت ثبت شد.' });
  } catch (e) {
    return c.json({ error: 'نام شرکت تکراری است یا خطایی رخ داده.' }, 400);
  }
});

// API: Login & Location
app.post('/api/login', async (c) => {
  const { companySlug, username, password } = await c.req.json();
  const company = await c.env.DB.prepare("SELECT * FROM companies WHERE slug = ?").bind(companySlug).first();
  if (!company) return c.json({ error: 'شرکت یافت نشد' }, 404);

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE company_id = ? AND username = ? AND password = ?").bind(company.id, username, password).first();
  if (!user) return c.json({ error: 'نام کاربری یا رمز اشتباه است' }, 401);

  // Auto Location Tracking via Cloudflare
  const cf = c.req.raw.cf;
  c.env.DB.prepare("INSERT INTO login_logs (user_id, latitude, longitude, city, country) VALUES (?, ?, ?, ?, ?)").bind(user.id, cf?.latitude||0, cf?.longitude||0, cf?.city||'', cf?.country||'').run().catch(()=>{});

  const token = await sign({ sub: user.id, role: user.role, companyId: company.id }, c.env.JWT_SECRET);
  return c.json({ token, role: user.role, location: { city: cf?.city || 'Unknown' } });
});

// Auth Middleware
app.use('/api/*', async (c, next) => {
  if (c.req.path.includes('/chat/ws')) return next(); // Skip for WS handshake initially
  const auth = c.req.header('Authorization');
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verify(auth.split(' ')[1], c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch { return c.json({ error: 'Invalid Token' }, 403); }
});

// Task APIs
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
  if (user.role === 'employee') return c.json({ error: 'دسترسی ندارید' }, 403);
  const { title, assignedToId, deadline } = await c.req.json();
  await c.env.DB.prepare("INSERT INTO tasks (company_id, title, assigned_to, supervisor_id, deadline) VALUES (?, ?, ?, ?, ?)").bind(user.companyId, title, assignedToId, user.sub, deadline).run();
  return c.json({ success: true });
});

app.put('/api/tasks/:id/:action', async (c) => {
  const user = c.get('user');
  const { id, action } = c.req.param();
  let q = "";
  
  if (action === 'complete') {
    q = "UPDATE tasks SET status = 'done' WHERE id = ? AND assigned_to = ? AND company_id = ?";
    await c.env.DB.prepare(q).bind(id, user.sub, user.companyId).run();
  } else if (action === 'approve') {
    if (user.role === 'employee') return c.json({ error: 'دسترسی ندارید' }, 403);
    q = "UPDATE tasks SET status = 'approved' WHERE id = ? AND company_id = ?";
    await c.env.DB.prepare(q).bind(id, user.companyId).run();
  }
  return c.json({ success: true });
});

app.get('/api/reports', async (c) => {
    const user = c.get('user');
    if (user.role === 'employee') return c.json({ error: 'دسترسی ندارید' }, 403);
    const { results } = await c.env.DB.prepare("SELECT assigned_to, COUNT(*) as total, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved FROM tasks WHERE company_id = ? GROUP BY assigned_to").bind(user.companyId).all();
    return c.json(results);
});

// Chat WebSocket Entry
app.get('/api/chat/ws', async (c) => {
    const upgrade = c.req.header('Upgrade');
    if (upgrade !== 'websocket') return c.text('Expected websocket', 426);
    
    // In real app, verify token from query param here
    const token = c.req.query('token');
    // Simplified: Assuming valid token logic here or skipping for brevity in single file
    
    // We decode token just to get companyId to isolate chat rooms
    try {
        const payload = await verify(token, c.env.JWT_SECRET);
        const id = c.env.CHAT_ROOM.idFromName(payload.companyId.toString());
        const stub = c.env.CHAT_ROOM.get(id);
        return stub.fetch(c.req.raw);
    } catch {
        return c.text("Unauthorized Chat Access", 403);
    }
});

export default app;
