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
        .feature-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}
.feature-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.feature-title {
  font-weight: bold;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: #fff;
}
.feature-desc {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
}
.switch {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
}
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #2a2a2a;
  transition: .3s;
  border-radius: 4px;
  border: 1px solid #3a3a3a;
}
.slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background-color: #666;
  transition: .3s;
  border-radius: 2px;
}
input:checked + .slider { background-color: #ffffff; }
input:checked + .slider:before {
  transform: translateX(18px);
  background-color: #000000;
}
.action-btn {
  background: #1a1a1a;
  color: #888;
  border: 1px solid #262626;
  border-radius: 3px;
  padding: 8px 0;
  font-size: 9px;
  font-weight: bold;
  cursor: pointer;
}
.action-btn.active {
  background: #ffffff;
  color: #000000;
  border-color: #ffffff;
}
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
          <div id="home-screen" class="screen active">
  <!-- Top Offline Status & Refresh Info -->
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 10px;">
    <div style="display: flex; align-items: center; gap: 6px; color: #888;">
      <span style="width: 6px; height: 6px; background: #666; border-radius: 50%; display: inline-block;"></span>
      OFFLINE
    </div>
    <div style="color: #666;">LAST REFRESHED 45 MIN AGO</div>
  </div>

  <!-- Central Circular Timer / Skull Logo Section -->
  <div style="position: relative; text-align: center; margin: 25px 0; padding: 20px 0; background: radial-gradient(circle, #181818 0%, #0c0c0c 70%); border-radius: 12px; border: 1px solid #1a1a1a;">
    <!-- Skull / Phantom Logo Icon -->
    <div style="display: flex; justify-content: center; margin-bottom: 8px;">
      <svg width="65" height="65" viewBox="0 0 24 24" fill="#ffffff">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 2.21.72 4.26 1.94 5.92L3 21l3.08-.94C7.74 21.28 9.79 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3-9c.83 0 1.5-.67 1.5-1.5S9.83 8 9 8s-1.5.67-1.5 1.5S8.17 11 9 11zm6 0c.83 0 1.5-.67 1.5-1.5S15.83 8 15 8s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-3 4.5c2.03 0 3.8-1.11 4.75-2.75-.41-.16-.9-.25-1.41-.25h-6.68c-.51 0-1 .09-1.41.25.95 1.64 2.72 2.75 4.75 2.75z"/>
      </svg>
    </div>
    <div style="font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #fff;" id="timer-display">2H 11M</div>
    <div style="font-size: 9px; color: #777; letter-spacing: 1px; margin-top: 4px;">TIME LEFT</div>
  </div>

  <!-- Key Display Box with Copy Button -->
  <div style="background: #121212; border: 1px solid #1f1f1f; border-radius: 6px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
    <div>
      <div style="font-size: 8px; color: #666; margin-bottom: 2px; letter-spacing: 0.5px;">KEY</div>
      <div style="font-size: 11px; font-weight: bold; color: #fff; letter-spacing: 1px;" id="display-key">PHTM-E9E0-1A89-A3E7</div>
    </div>
    <button type="button" onclick="copyKeyText()" style="background: #1a1a1a; color: #fff; border: 1px solid #262626; border-radius: 4px; padding: 6px 12px; font-size: 9px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
      📋 COPY
    </button>
  </div>

  <!-- Info Cards Grid (Activated, Expires, Device) -->
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 15px;">
    <div style="background: #121212; border: 1px solid #1f1f1f; border-radius: 6px; padding: 10px;">
      <span style="display: block; font-size: 8px; color: #666; margin-bottom: 4px;">ACTIVATED</span>
      <strong style="font-size: 10px; color: #fff;" id="info-activated">29 Oct 2026</strong>
    </div>
    <div style="background: #121212; border: 1px solid #1f1f1f; border-radius: 6px; padding: 10px;">
      <span style="display: block; font-size: 8px; color: #666; margin-bottom: 4px;">EXPIRES</span>
      <strong style="font-size: 10px; color: #fff;" id="info-expires">30 Oct 2026</strong>
    </div>
    <div style="background: #121212; border: 1px solid #1f1f1f; border-radius: 6px; padding: 10px;">
      <span style="display: block; font-size: 8px; color: #666; margin-bottom: 4px;">DEVICE</span>
      <strong style="font-size: 10px; color: #fff; line-height: 1.2;" id="info-device">iPhone 11 Pro Max · iOS</strong>
    </div>
  </div>

  <!-- Add Subscription Action Banner -->
  <div style="background: #121212; border: 1px solid #1f1f1f; border-radius: 6px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div style="font-weight: bold; font-size: 12px; color: #fff; letter-spacing: 0.5px;">ADD SUBSCRIPTION</div>
      <div style="font-size: 9px; color: #777; margin-top: 2px;">opens your vpn app with your key ready</div>
    </div>
    <div style="background: #e0e0e0; color: #000; width: 32px; height: 32px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; cursor: pointer;">
      +
    </div>
  </div>
</div>
            <div id="features-screen" class="screen">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
    <div style="font-weight: bold; font-size: 14px; letter-spacing: 1px;">FEATURES</div>
    <div style="color: #888; font-size: 11px;">5/5</div>
  </div>
  <div style="color: #666; font-size: 10px; margin-bottom: 15px;">changes apply from your next match</div>

  <!-- 01 MARKER -->
  <div class="feature-card">
    <div class="feature-header">
      <span class="feature-title">01 MARKER</span>
      <label class="switch">
        <input type="checkbox" checked>
        <span class="slider"></span>
      </label>
    </div>
    <div class="feature-desc">marks every enemy on your screen.</div>
    
    <div style="font-size: 9px; color: #777; margin-top: 12px; margin-bottom: 6px; text-transform: uppercase;">MARK STYLE</div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
      <button type="button" class="action-btn active" onclick="selectMarker(this)">PHANTOM</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">DREAM</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">ICE WALL</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">MOCO</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">CLU</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">SHIROU</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">IRIS</button>
      <button type="button" class="action-btn" onclick="selectMarker(this)">DREKI</button>
    </div>
  </div>

  <!-- 02 AIMPOINT -->
  <div class="feature-card">
    <div class="feature-header">
      <span class="feature-title">02 AIMPOINT <span style="background:#222; font-size:8px; padding:2px 4px; border-radius:2px; color:#aaa; margin-left:4px;">NEW</span></span>
      <label class="switch">
        <input type="checkbox" checked>
        <span class="slider"></span>
      </label>
    </div>
    <div class="feature-desc">moves your aim from the chest toward the head. slide to choose how far.</div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; margin-bottom: 10px;">
      <span style="font-size: 9px; color: #777; font-weight: bold;">AIM HEIGHT</span>
      <span style="color: #ff4757; font-weight: bold; font-size: 16px;">HEAD <span id="aim-val-display" style="font-size: 20px;">100%</span></span>
    </div>

    <!-- Interactive Vertical Aim Height Slider Container -->
    <div style="display: flex; gap: 20px; align-items: center; background: #0c0c0c; padding: 12px; border-radius: 4px; border: 1px solid #1a1a1a;">
      <!-- Body Silhouette with Head Highlight -->
      <div style="position: relative; width: 45px; height: 110px; border: 1px dashed #ff4757; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 6px;">
        <div style="width: 14px; height: 14px; border: 2px solid #ff4757; border-radius: 2px; background: repeating-linear-gradient(45deg, #ff4757, #ff4757 2px, transparent 2px, transparent 4px);"></div>
        <div style="width: 2px; height: 60px; background: linear-gradient(to bottom, #ff4757, #333); margin-top: 4px;"></div>
        <div style="width: 20px; height: 10px; border-bottom: 2px solid #ff4757;"></div>
      </div>

      <!-- Vertical Slider & Labels -->
      <div style="flex-grow: 1; display: flex; position: relative; height: 110px; align-items: center;">
        <input type="range" id="aim-height-range" min="0" max="100" value="100" style="position: absolute; width: 110px; height: 4px; transform: rotate(-90deg); transform-origin: 55px 55px; left: -35px; top: 0; accent-color: #ff4757; cursor: pointer;">
        
        <div style="margin-left: 60px; display: flex; flex-direction: column; justify-content: space-between; height: 100%; font-size: 9px; color: #666; font-weight: bold;">
          <div style="color: #ff4757; display: flex; justify-content: space-between; width: 140px;"><span>— HEAD</span><span>100%</span></div>
          <div style="display: flex; justify-content: space-between; width: 140px;"><span>— NECK</span><span>68%</span></div>
          <div style="display: flex; justify-content: space-between; width: 140px;"><span>— SHOULDERS</span><span>50%</span></div>
          <div style="display: flex; justify-content: space-between; width: 140px;"><span>— UPPER CHEST</span><span>30%</span></div>
          <div style="display: flex; justify-content: space-between; width: 140px;"><span>— CHEST</span><span>0%</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 03 AIM LAG -->
  <div class="feature-card">
    <div class="feature-header">
      <span class="feature-title">03 AIM LAG</span>
      <label class="switch">
        <input type="checkbox" checked>
        <span class="slider"></span>
      </label>
    </div>
    <div class="feature-desc">freezes the enemy for a moment while you fire or scope, so they're easier to hit.</div>
    <div style="margin-top: 12px; background: #0e0e0e; padding: 8px 12px; border-radius: 4px; display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #ccc;">
        <span>when firing</span>
        <label class="switch"><input type="checkbox"><span class="slider"></span></label>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #ccc;">
        <span>when scoping</span>
        <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
      </div>
    </div>
  </div>

  <!-- 04 FAST REVIVE -->
  <div class="feature-card">
    <div class="feature-header">
      <span class="feature-title">04 FAST REVIVE</span>
      <label class="switch">
        <input type="checkbox" checked>
        <span class="slider"></span>
      </label>
    </div>
    <div class="feature-desc">picks up a knocked teammate in about 0.1 s instead of 3 s.</div>
  </div>
</div>
            <div id="manage-screen" class="screen">
            <!-- Telegram Channel Direct Link Card -->
  <div style="background: #121212; border: 1px solid #1f1f1f; border-radius: 6px; padding: 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="window.open('https://t.me/+rd5guGEUyR41MzA1', '_blank')">
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 16px;">📢</span>
      <div>
        <div style="font-weight: bold; font-size: 12px; color: #fff; letter-spacing: 0.5px;">PAID_PUSH 💯</div>
        <div style="font-size: 9px; color: #777; margin-top: 2px;">Open official telegram channel</div>
      </div>
    </div>
    <div style="color: #888; font-size: 12px; font-weight: bold;">➔</div>
  </div>
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
    function selectMarker(element) {
    let buttons = element.parentElement.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}
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

app.get('/admin', (req, res) => {
    res.send(adminPage);
});
app.post('/admin/generate', express.urlencoded({ extended: true }), (req, res) => {
    const { duration, type, count } = req.body;
    
    const generateKeyString = () => 'DRAKE-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    let stmt = db.prepare(`INSERT INTO keys (key_code, duration_value, duration_type, status) VALUES (?, ?, ?, 'unused')`);
    
    for (let i = 0; i < (parseInt(count) || 1); i++) {
        stmt.run(generateKeyString(), duration, type);
    }
    stmt.finalize((err) => {
        db.all(`SELECT * FROM keys ORDER BY id DESC`, (dbErr, rows) => {
            let keyRowsHTML = rows.map(row => `
                <tr>
                    <td>${row.key_code}</td>
                    <td>${row.duration_value} ${row.duration_type}</td>
                    <td>${row.status}</td>
                    <td>${row.device_info || 'N/A'}</td>
                </tr>
            `).join('');

            let renderedPage = adminPage.replace('{{KEY_LIST}}', keyRowsHTML);
            res.send(renderedPage);
        });
    });
});
app.post('/api/verify', verifyLimiter, (req, res) => {
    const { key, device } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'Key is required' });

    const cleanKey = key.trim();

    db.get('SELECT * FROM keys WHERE LOWER(TRIM(key_code)) = LOWER(?)', [cleanKey], (err, row) => {
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
                    if (uErr) return res.status(500).json({ success: false, message: 'Database error' });
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
        } else if (row.status === 'active') {
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
        } else {
            return res.status(400).json({ success: false, message: 'Key has expired' });
        }
    });
});

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