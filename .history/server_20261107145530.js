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

  // Agar key pehle se activate nahi hui hai, toh activation date set karein
  if (!foundKey.activatedAt) {
    foundKey.activatedAt = now;
    
    // Agar lifetime nahi hai, toh duration ke hisab se expiry set karein
    if (foundKey.durationDays && foundKey.durationDays !== "LIFETIME") {
      const days = parseInt(foundKey.durationDays);
      foundKey.expiresAt = now + (days * 24 * 60 * 60 * 1000);
    } else {
      foundKey.expiresAt = "LIFETIME";
    }
    foundKey.device = deviceName || "Unknown Device";
    writeData(db);
  }

  // Expiry Check
  if (foundKey.expiresAt !== "LIFETIME" && now > foundKey.expiresAt) {
    return res.json({ success: false, message: "Key Expired!" });
  }

  res.json({ success: true, keyData: foundKey });
});

// 2. GENERATE KEY (Admin Only)
app.post('/api/admin/generate-key', (req, res) => {
  const { pin, durationDays } = req.body;
  const db = readData();

  if (pin !== db.adminPin) {
    return res.json({ success: false, message: "Incorrect Admin PIN!" });
  }

  // Generate random key (e.g. DRAKE-A1B2-C3D4)
  const randPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const newKey = `DRAKE-${randPart()}-${randPart()}-${randPart()}`;

  let expiresAt = "LIFETIME";
  if (durationDays !== "LIFETIME") {
    const days = parseInt(durationDays);
    expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
  }

  const keyObj = {
    key: newKey,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt
  };

  db.keys.push(keyObj);
  writeData(db);

  res.json({ success: true, key: newKey, expiresAt });
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

app.listen(3000, () => console.log('DRAKE Server running on http://localhost:3000'));