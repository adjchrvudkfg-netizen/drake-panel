const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
const DB_FILE = path.join(__dirname, 'database.json');

// Database Helper Functions
function readData() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [], adminPin: "1234" }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
// 1. VERIFY KEY (User Login)
app.post('/api/verify-key', (req, res) => {
  const { key, deviceName } = req.body;
  const db = readData();
  const foundKey = db.keys.find(k => k.key === key.trim());

  if (!foundKey) {
    return res.json({ success: false, message: "Invalid Key! Contact Admin." });
  }

  const now = Date.now();

  // Agar key pehle se activate nahi hui hai ya expiresAt valid number nahi hai
  if (!foundKey.activatedAt || typeof foundKey.expiresAt !== 'number') {
    foundKey.activatedAt = now;
    // Default 24 hours agar expiry set nahi thi
    foundKey.expiresAt = foundKey.expiresAt && typeof foundKey.expiresAt === 'number' ? foundKey.expiresAt : (now + (24 * 60 * 60 * 1000));
    foundKey.device = deviceName || "Mobile Device";
    writeData(db);
  }

  // Expiry Check
  if (now > foundKey.expiresAt) {
    return res.json({ success: false, message: "Key Expired!" });
  }

  res.json({ success: true, keyData: foundKey });
});
// 2. GENERATE KEYS (Admin Bulk Generation with Hours/Days support)
app.post('/api/admin/generate-key', (req, res) => {
  const { count, durationValue, durationType } = req.body;
  const db = readData();

  const numKeys = parseInt(count) || 1;
  const val = parseInt(durationValue) || 1;
  const generatedKeys = [];

  const randPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();

  for (let i = 0; i < numKeys; i++) {
    const newKey = `DRAKE-${randPart()}-${randPart()}-${randPart()}`;

    let msToAdd = 0;
    if (durationType === 'hours') {
      msToAdd = val * 60 * 60 * 1000;
    } else if (durationType === 'days') {
      msToAdd = val * 24 * 60 * 60 * 1000;
    }

    const expiresAt = Date.now() + msToAdd;

    const keyObj = {
      key: newKey,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt
    };

    db.keys.push(keyObj);
    generatedKeys.push(newKey);
  }

  writeData(db);
  res.json({ success: true, keys: generatedKeys });
});

// Admin Login Verify Route
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin1234") {
    return res.json({ success: true });
  }
  res.json({ success: false, message: "Invalid Username or Password!" });
});

app.get('/api/admin/list-keys', (req, res) => {
  const db = readData();
  res.json({ success: true, keys: db.keys });
});
// 3. GET ALL KEYS (Admin List)
app.post('/api/admin/list-keys', (req, res) => {
  const { pin } = req.body;
  const db = readData();
  if (pin !== db.adminPin) {
    return res.json({ success: false, message: "Unauthorized" });
  }
  res.json({ success: true, keys: db.keys });
});
// --- Baki saare purane routes (verify-key, generate-key, etc.) ---

// Happ Proxy App Direct Subscription Endpoint
app.get('/sub/:key', (req, res) => {
  const reqKey = (req.params.key || "").trim().toLowerCase();
  const db = readData();

  const foundKey = db.keys.find(k => k.key && k.key.trim().toLowerCase() === reqKey);

  if (!foundKey) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(404).send("Invalid Key");
  }

  // Proper VLESS link configuration for Happ App
  const config = `vless://drake-user@127.0.0.1:443?type=tcp&security=none#DRAKE-${foundKey.key}`;
  const base64Config = Buffer.from(config).toString('base64');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(base64Config);
});