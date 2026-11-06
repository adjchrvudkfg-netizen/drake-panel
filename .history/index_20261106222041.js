const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const rateLimit = require('express-rate-limit');

const app = express();

// Single Database Connection
const db = new sqlite3.Database('drake.db', (err) => {
  if (err) {
    console.error('Database opening error: ' + err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});
// Tables Creation
db.serialize(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_code TEXT UNIQUE,
      duration_value REAL,
      duration_type TEXT,
      activated_date TEXT,
      expiry_date TEXT,
      device_info TEXT,
      status TEXT DEFAULT 'unused'
    );
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    );
  `, (err) => {
    if (err) {
      console.error("Table creation error: " + err.message);
    } else {
      // Default Admin Check
      db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, row) => {
        if (!row) {
          const stmt = db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)');
          stmt.run('admin', 'admin123', (insertErr) => {
            if (insertErr) console.error(insertErr);
            else console.log('Default admin created (Username: admin, Password: admin123)');
          });
          stmt.finalize();
        }
      });
    }
  });
});
const verifyLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Bahut zyada requests. Thodi der baad try karein.' }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'drake-secure-super-secret-key-99',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'strict' }
}));

const htmlPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Drake Panel</title>
    <style>
        :root { --bg-color: #0c0c0c; --card-bg: #141414; --border-color: #262626; --text-main: #ffffff; --text-muted: #888888; --accent-red: #ff5252; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: monospace, sans-serif; }
        body { background-color: var(--bg-color); color: var(--text-main); display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .phone-frame { width: 100%; max-width: 420px; height: 100vh; max-height: 850px; background: var(--bg-color); border: 2px solid var(--border-color); display: flex; flex-direction: column; position: relative; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.8); }
        .top-bar { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid var(--border-color); }
        .top-bar h1 { font-size: 16px; letter-spacing: 2px; }
        .content { flex: 1; padding: 15px; overflow-y: scroll; padding-bottom: 80px; }
        .screen { display: none; }
        .screen.active { display: block; }
        .login-container { text-align: center; margin-top: 20px; }
        .input-group { text-align: left; background: var(--card-bg); border: 1px solid var(--border-color); padding: 12px; margin-bottom: 15px; }
        .input-group label { display: block; font-size: 9px; color: var(--text-muted); margin-bottom: 5px; }
        .input-row { display: flex; justify-content: space-between; align-items: center; }
        .input-row input { background: transparent; border: none; color: var(--text-main); font-size: 13px; outline: none; width: 70%; }
        .icon-btn { background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-main); padding: 5px 10px; font-size: 11px; cursor: pointer; }
        .action-btn { width: 100%; background: var(--text-main); color: var(--bg-color); border: none; padding: 14px; font-weight: bold; font-size: 13px; cursor: pointer; margin-top: 10px; }
        .error-msg { color: #ff5252; font-size: 10px; margin-top: 8px; text-align: center; }
        .status-row { display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 10px; }
        .timer-section { text-align: center; margin: 10px 0 20px 0; }
        .time-left-val { font-size: 26px; font-weight: bold; margin-bottom: 2px; }
        .time-left-label { font-size: 9px; color: var(--text-muted); }
        .key-box { background: var(--card-bg); border: 1px solid var(--border-color); padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 11px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .info-card { background: var(--card-bg); border: 1px solid var(--border-color); padding: 10px 6px; text-align: center; }
        .info-card span { display: block; font-size: 8px; color: var(--text-muted); margin-bottom: 4px; }
        .info-card strong { font-size: 9px; }
        .feature-card { background: var(--card-bg); border: 1px solid var(--border-color); padding: 12px; margin-bottom: 12px; }
        .feature-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .feature-title { font-size: 11px; font-weight: bold; color: #fff; }
        .feature-desc { font-size: 8px; color: var(--text-muted); margin-bottom: 10px; }
        .switch { position: relative; display: inline-block; width: 36px; height: 20px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider-switch { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #222; border: 1px solid #444; transition: .3s; }
        .slider-switch:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; transition: .3s; }
        input:checked + .slider-switch { background-color: #fff; }
        input:checked + .slider-switch:before { transform: translateX(16px); background-color: #000; }
        .nav-bar { position: absolute; bottom: 0; left: 0; width: 100%; background: #0f0f0f; border-top: 1px solid var(--border-color); display: flex; justify-content: space-around; padding: 10px 0; z-index: 10; }
        .nav-item { background: none; border: none; color: var(--text-muted); font-size: 9px; cursor: pointer; text-align: center; }
        .nav-item.active { color: var(--text-main); }
    </style>
</head>
<body>
    <div class="phone-frame">
        <div class="top-bar">
            <h1 id="page-title">DRAKE</h1>
        </div>
        <div class="content">
            <div id="login-screen" class="screen active">
                <div class="login-container">
                    <h2>DRAKE PANEL</h2>
                    <p style="font-size:9px; color:#888; margin-bottom:20px;">ENTER YOUR LICENSE KEY</p>
                    <form onsubmit="handleLogin(event)">
                        <div class="input-group">
                            <label>■ ACCESS KEY</label>
                            <div class="input-row">
                                <input type="text" id="key-input" placeholder="DRKE-XXXX-XXXX-XXXX" required>
                                <button type="button" class="icon-btn" onclick="pasteKey()">PASTE</button>
                            </div>
                        </div>
                        <button type="submit" class="action-btn">UNLOCK</button>
                        <div id="login-error" class="error-msg"></div>
                    </form>
                </div>
            </div>
            <div id="home-screen" class="screen">
                <div class="status-row">
                    <span style="color:#4caf50;">■ ONLINE</span>
                    <span>CONNECTED</span>
                </div>
                <div class="timer-section">
                    <div class="time-left-val" id="time-left-display">ACTIVE</div>
                    <div class="time-left-label">STATUS</div>
                </div>
                <div class="key-box">
                    <span id="display-key">-</span>
                </div>
                <div class="info-grid">
                    <div class="info-card"><span>ACTIVATED</span><strong id="info-activated">-</strong></div>
                    <div class="info-card"><span>EXPIRES</span><strong id="info-expires">-</strong></div>
                    <div class="info-card"><span>DEVICE</span><strong id="info-device">-</strong></div>
                </div>
            </div>
            <div id="features-screen" class="screen">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-weight: bold; font-size: 14px; letter-spacing: 1px;">FEATURES</div>
            <div style="color: #888; font-size: 11px;">5/5</div>
          </div>
          <div style="color: #666; font-size: 10px; margin-bottom: 15px;">changes apply from your next match</div>

          <!-- 01 MARKER -->
          <div class="feature-card">
            <div class="feature-header">
              <span class="feature-title">01 MARKER</span>
              <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
            </div>
            <div class="feature-desc">marks every enemy on your screen.</div>
            <div style="font-size: 9px; color: #777; margin-top: 12px; margin-bottom: 6px; text-transform: uppercase; font-weight: bold;">MARK STYLE</div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
              <button type="button" class="action-btn" style="background:#fff; color:#000; font-size:9px; font-weight:bold; padding:6px 2px;">PHANTOM</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">DREAM</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">ICE WALL</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">MOCO</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">CLU</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">SHIROU</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">IRIS</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">DREKI</button>
            </div>
          </div>

          <!-- 02 AIMPOINT -->
          <div class="feature-card">
            <div class="feature-header">
              <span class="feature-title">02 AIMPOINT <span style="background:#222; font-size:8px; padding:2px 4px; border-radius:3px; color:#aaa;">NEW</span></span>
              <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
            </div>
            <div class="feature-desc">moves your aim from the chest toward the head. slide to choose how far.</div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; margin-bottom: 8px;">
              <span style="font-size: 9px; color: #777; font-weight: bold;">AIM HEIGHT</span>
              <span style="color: #ff4757; font-weight: bold; font-size: 16px;">HEAD 100%</span>
            </div>

            <!-- Diagram & Slider Container -->
            <div style="display: flex; gap: 12px; align-items: center; background: #0c0c0c; padding: 10px; border-radius: 6px; border: 1px solid #222;">
              <!-- Body Diagram Silhouette -->
              <div style="width: 45px; height: 110px; border: 1px dashed #ff4757; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 4px 0; box-sizing: border-box; background: rgba(255, 71, 87, 0.05);">
                <div style="width: 14px; height: 14px; border: 2px solid #ff4757; border-radius: 2px; background: #ff4757;"></div>
                <div style="width: 2px; height: 60px; background: linear-gradient(to bottom, #ff4757, #333);"></div>
                <div style="width: 20px; height: 10px; border-bottom: 2px solid #333;"></div>
              </div>

              <!-- Height Levels List -->
              <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px; font-size: 10px; color: #666;">
                <div style="display: flex; justify-content: space-between; color: #ff4757; font-weight: bold; border-left: 2px solid #ff4757; padding-left: 6px;">
                  <span>HEAD</span>
                  <span>100%</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-left: 6px;">
                  <span>NECK</span>
                  <span>68%</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-left: 6px;">
                  <span>SHOULDERS</span>
                  <span>50%</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-left: 6px;">
                  <span>UPPER CHEST</span>
                  <span>30%</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-left: 6px;">
                  <span>CHEST</span>
                  <span>0%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 03 AIM LAG -->
          <div class="feature-card">
            <div class="feature-header">
              <span class="feature-title">03 AIM LAG</span>
              <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
            </div>
            <div class="feature-desc">freezes the enemy for a moment while you fire or scope, so they're easier to hit.</div>
            
            <div style="margin-top: 12px; background: #0c0c0c; padding: 8px 12px; border-radius: 6px; border: 1px solid #222;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 11px; color: #ccc;">when firing</span>
                <input type="checkbox" style="accent-color: #555;">
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1a1a1a; padding-top: 8px;">
                <span style="font-size: 11px; color: #ccc;">when scoping</span>
                <input type="checkbox" checked style="accent-color: #fff;">
              </div>
            </div>
          </div>

          <!-- 04 GLOO WALL ROTATION -->
          <div class="feature-card">
            <div class="feature-header">
              <span class="feature-title">04 GLOO WALL ROTATION</span>
              <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
            </div>
            <div class="feature-desc">turns your gloo wall to the angle you set.</div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
              <span style="font-size: 9px; color: #777; font-weight: bold;">WALL ANGLE</span>
              <span style="color: #fff; font-weight: bold; font-size: 18px;">180°</span>
            </div>

            <div style="position: relative; margin: 12px 0;">
              <input type="range" min="-90" max="180" value="180" style="width: 100%; accent-color: #fff;">
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">-90°</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">0°</button>
              <button type="button" class="action-btn" style="background:#1a1a1a; color:#888; font-size:9px; padding:6px 2px;">+90°</button>
              <button type="button" class="action-btn" style="background:#fff; color:#000; font-size:9px; font-weight:bold; padding:6px 2px;">180°</button>
            </div>
          </div>

          <!-- 05 FAST REVIVE -->
          <div class="feature-card">
            <div class="feature-header">
              <span class="feature-title">05 FAST REVIVE</span>
              <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
            </div>
            <div class="feature-desc">picks up a knocked teammate in about 0.1 s instead of 3 s.</div>
          </div>
        </div>
            <div id="manage-screen" class="screen">
                <div class="feature-card">
                    <div style="font-size:8px; color:#888;">THIS DEVICE</div>
                    <div id="manage-device-name" style="font-size:12px; font-weight:bold; margin:4px 0;">-</div>
                    <button class="action-btn" onclick="resetDevice()" style="background:#1a1a1a; color:#fff; border:1px solid #333; font-size:11px;">RESET DEVICE HWID</button>
                </div>
                <button class="action-btn" onclick="logout()" style="background:#3a1515; color:#ff6b6b; font-size:12px;">LOG OUT</button>
            </div>
        </div>
        <div class="nav-bar" id="bottom-nav" style="display:none;">
            <button class="nav-item active" onclick="switchTab('home', this)">HOME</button>
            <button class="nav-item" onclick="switchTab('features', this)">FEATURES</button>
            <button class="nav-item" onclick="switchTab('manage', this)">MANAGE</button>
        </div>
    </div>
    <script>
        let currentKey = "";
        function pasteKey() {
            navigator.clipboard.readText().then(text => { document.getElementById('key-input').value = text.trim(); });
        }
        async function handleLogin(e) {
            e.preventDefault();
            const key = document.getElementById('key-input').value.trim();
            const deviceInfo = navigator.userAgent.includes("Android") ? "Android Device" : "PC / Web";
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, deviceInfo })
            });
            const data = await res.json();
            if(data.success) {
                currentKey = key;
                document.getElementById('display-key').innerText = data.key;
                document.getElementById('info-activated').innerText = data.activated || 'Today';
                document.getElementById('info-expires').innerText = data.expires || 'Valid';
                document.getElementById('info-device').innerText = data.device;
                document.getElementById('manage-device-name').innerText = data.device;
                document.getElementById('login-screen').classList.remove('active');
                document.getElementById('home-screen').classList.add('active');
                document.getElementById('bottom-nav').style.display = 'flex';
                document.getElementById('page-title').innerText = "HOME";
            } else {
                document.getElementById('login-error').innerText = data.message;
            }
        }
        function switchTab(tabName, element) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            if(tabName === 'home') {
                document.getElementById('home-screen').classList.add('active');
                document.getElementById('page-title').innerText = "HOME";
            } else if(tabName === 'features') {
                document.getElementById('features-screen').classList.add('active');
                document.getElementById('page-title').innerText = "FEATURES";
            } else if(tabName === 'manage') {
                document.getElementById('manage-screen').classList.add('active');
                document.getElementById('page-title').innerText = "MANAGE";
            }
            element.classList.add('active');
        }
        async function resetDevice() {
            const res = await fetch('/api/reset-device', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: currentKey })
            });
            const data = await res.json();
            if(data.success) { alert("Device reset successfully!"); logout(); }
        }
        function logout() {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('login-screen').classList.add('active');
            document.getElementById('bottom-nav').style.display = 'none';
            document.getElementById('page-title').innerText = "DRAKE";
            document.getElementById('key-input').value = "";
            currentKey = "";
        }
    </script>
</div>
  </body>
</html>`; 

const adminPage = `<!DOCTYPE html>
...
    <meta charset="UTF-8">
    <title>Admin Dashboard</title>
    <style>
        body { background: #0c0c0c; color: #fff; font-family: monospace; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #141414; border: 1px solid #262626; padding: 20px; }
        input, select { background: #0c0c0c; border: 1px solid #333; color: #fff; padding: 10px; width: 100%; margin-bottom: 15px; }
        button { background: #fff; color: #000; border: none; padding: 12px; font-weight: bold; width: 100%; cursor: pointer; }
        table { width: 100%; margin-top: 20px; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #262626; padding: 8px; text-align: left; }
        th { background: #1a1a1a; }
    </style>
</head>
<body>
    <div class="container">
        <h2>ADMIN KEY GENERATOR</h2>
        <form action="/admin/generate" method="POST">
            <label>Duration Value:</label>
            <input type="number" step="0.1" name="duration" value="2" required>
            <label>Duration Type:</label>
            <select name="type">
                <option value="hours">Hours</option>
                <option value="days">Days</option>
            </select>
            <label>Count:</label>
            <input type="number" name="count" value="1" min="1" max="50" required>
            <button type="submit">GENERATE KEYS</button>
        </form>
        <table>
            <tr><th>Key</th><th>Duration</th><th>Status</th><th>Device</th></tr>
            {{KEY_LIST}}
        </table>
    </div>
</body>
</html>`;

app.get('/', (req, res) => { res.send(htmlPage); });

app.post('/api/verify', verifyLimiter, (req, res) => {
    const { key, device } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'Key is required' });

    db.get('SELECT * FROM keys WHERE key_code = ?', [key], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, message: 'Invalid key' });
        }

        const now = new Date();

        // 1. Unused Key: First Time Activation
        if (row.status === 'unused') {
            let expiryDate = new Date();
            if (row.duration_type === 'hours') {
                expiryDate.setHours(expiryDate.getHours() + parseFloat(row.duration_value));
            } else {
                expiryDate.setDate(expiryDate.getDate() + parseFloat(row.duration_value));
            }

            const actStr = now.toISOString();
            const expStr = expiryDate.toISOString();
            const devInfo = device || 'Web Browser';

            db.run(
                'UPDATE keys SET status = "active", activated_date = ?, expiry_date = ?, device_info = ? WHERE id = ?',
                [actStr, expStr, devInfo, row.id],
                (uErr) => {
                    if (uErr) return res.status(500).json({ success: false, message: 'DB update failed' });
                    return res.json({
                        success: true,
                        key: row.key_code,
                        activated: actStr,
                        expires: expStr,
                        device: devInfo,
                        status: 'active'
                    });
                }
            );
        } else {
            // 2. Already Active Key Check
            const expDate = new Date(row.expiry_date);
            if (now > expDate) {
                // Key Expired
                db.run('UPDATE keys SET status = "expired" WHERE id = ?', [row.id]);
                return res.status(403).json({ success: false, message: 'Key has expired' });
            }

            // Key still valid
            return res.json({
                success: true,
                key: row.key_code,
                activated: row.activated_date,
                expires: row.expiry_date,
                device: row.device_info || device || 'Web Browser',
                status: 'active'
            });
        }
    });
});let timerInterval = null;

function startDashboardTimer(expiryDateStr) {
    if (timerInterval) clearInterval(timerInterval);

    function updateDisplay() {
        const now = new Date().getTime();
        const expiry = new Date(expiryDateStr).getTime();
        const diff = expiry - now;

        if (diff <= 0) {
            document.getElementById('time-left-display').innerText = '0H 0M 0S';
            document.getElementById('time-left-display').style.color = '#ff4757';
            clearInterval(timerInterval);
            alert('Your Key has expired!');
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById('time-left-display').innerText = `${hours}H ${minutes}M ${seconds}S`;
    }

    updateDisplay();
    timerInterval = setInterval(updateDisplay, 1000);
}

// Key verification request handling function
function submitKeyLogin(userKey) {
    fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: userKey, device: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Populate Key Info on UI
            document.getElementById('display-key').innerText = data.key;
            document.getElementById('info-activated').innerText = new Date(data.activated).toLocaleDateString();
            document.getElementById('info-expires').innerText = new Date(data.expires).toLocaleDateString();
            document.getElementById('info-device').innerText = data.device;

            // Start Live Expiry Countdown
            startDashboardTimer(data.expires);
        } else {
            alert(data.message || 'Verification Failed');
        }
    });
}
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});