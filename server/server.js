const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const DATA_FILE = path.join(__dirname, 'data', 'scores.json');
const FLOWER_POINTS = 30;

// ---------- Data layer (simple JSON file store) ----------
function pad(n) {
  return String(n).padStart(2, '0');
}

function buildInitialData() {
  return {
    round: 1, // 1 = female (G), 2 = male (M)
    candidates: {
      female: Array.from({ length: 10 }, (_, i) => ({
        id: `G${pad(i + 1)}`,
        name: `G${pad(i + 1)}`,
        score: 0,
        history: []
      })),
      male: Array.from({ length: 12 }, (_, i) => ({
        id: `M${pad(i + 1)}`,
        name: `M${pad(i + 1)}`,
        score: 0,
        history: []
      }))
    }
  };
}

function migrateData(data) {
  if (!data || !data.candidates) return { data: buildInitialData(), changed: true };
  let changed = false;
  ['female', 'male'].forEach((gender) => {
    if (!Array.isArray(data.candidates[gender])) return;
    data.candidates[gender].forEach((candidate) => {
      if (!Array.isArray(candidate.history)) {
        candidate.history = [];
        changed = true;
      }
    });
  });
  return { data, changed };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = buildInitialData();
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const { data: migrated, changed } = migrateData(raw);
    if (changed) {
      saveData(migrated);
    }
    return migrated;
  } catch (e) {
    console.error('Failed to parse data file, rebuilding.', e);
    const initial = buildInitialData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Redirect root URL to the public display page
app.get('/', (req, res) => {
  res.redirect('/display.html');
});

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function validGender(g) {
  return g === 'female' || g === 'male';
}

// ---------- API ----------

// Get candidates + scores for a gender
app.get('/api/candidates', (req, res) => {
  const gender = req.query.gender;
  if (!validGender(gender)) {
    return res.status(400).json({ error: 'invalid gender, must be female or male' });
  }
  res.json(data.candidates[gender]);
});

// Get current round (1 = female, 2 = male) - used by the public display screen
app.get('/api/round', (req, res) => {
  res.json({ round: data.round });
});

// Switch round (admin only)
app.post('/api/round', requireAdmin, (req, res) => {
  const { round } = req.body;
  if (![1, 2].includes(round)) {
    return res.status(400).json({ error: 'invalid round, must be 1 or 2' });
  }
  data.round = round;
  saveData(data);
  res.json({ round: data.round });
});

// Add points to a candidate
app.post('/api/vote', (req, res) => {
  const { gender, candidateId, amount } = req.body;
  if (!validGender(gender)) {
    return res.status(400).json({ error: 'invalid gender' });
  }
  const flowers = Number(amount);
  if (!Number.isInteger(flowers) || flowers <= 0) {
    return res.status(400).json({ error: 'invalid amount, must be a positive integer' });
  }
  const points = flowers * FLOWER_POINTS;
  const candidate = data.candidates[gender].find((c) => c.id === candidateId);
  if (!candidate) {
    return res.status(404).json({ error: 'candidate not found' });
  }
  candidate.score += points;
  candidate.history.push({ flowers, points, action: `+${flowers} ดอกไม้`, at: new Date().toISOString(), score: candidate.score });
  if (candidate.history.length > 10) {
    candidate.history.splice(0, candidate.history.length - 10);
  }
  saveData(data);
  res.json(candidate);
});

// Undo last vote action for a candidate (in case of misclick)
app.post('/api/vote/undo', (req, res) => {
  const { gender, candidateId } = req.body;
  if (!validGender(gender)) {
    return res.status(400).json({ error: 'invalid gender' });
  }
  const candidate = data.candidates[gender].find((c) => c.id === candidateId);
  if (!candidate) {
    return res.status(404).json({ error: 'candidate not found' });
  }
  const last = candidate.history.pop();
  const points = last && typeof last.points === 'number' ? last.points : last && typeof last.amount === 'number' ? last.amount : null;
  if (!last || points === null) {
    return res.status(400).json({ error: 'no vote history to undo' });
  }
  candidate.score = Math.max(0, candidate.score - points);
  saveData(data);
  res.json(candidate);
});

// Reset scores (admin only). body: { gender: 'female' | 'male' | 'all' }
app.post('/api/reset', requireAdmin, (req, res) => {
  const { gender } = req.body;
  if (gender === 'female' || gender === 'all') {
    data.candidates.female.forEach((c) => {
      c.score = 0;
      c.history = [];
    });
  }
  if (gender === 'male' || gender === 'all') {
    data.candidates.male.forEach((c) => {
      c.score = 0;
      c.history = [];
    });
  }
  saveData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`ระบบลงคะแนนดาว-เดือน running on port ${PORT}`);
});
