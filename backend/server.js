require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/manager', require('./routes/manager'));
app.use('/api/oe', require('./routes/oe'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Seed admin on first boot
async function seedAdmin() {
  try {
    const bcrypt = require('bcryptjs');
    const db = require('./database');
    const email = process.env.ADMIN_EMAIL || 'mail2linooz@gmail.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@123';
    const existing = await db.one("SELECT id FROM users WHERE role = 'admin'");
    if (!existing) {
      const hash = await bcrypt.hash(password, 10);
      await db.run("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
        ['Admin', email, hash]);
      console.log('Admin user created:', email);
    }
  } catch (e) {
    console.error('Seed error (tables may not exist yet):', e.message);
  }
}

// Serve built React frontend in production
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// Start server when run directly (local dev); export for Vercel serverless
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  seedAdmin();
  app.listen(PORT, () => console.log(`\nServer: http://localhost:${PORT}`));
} else {
  // Vercel cold start — seed admin asynchronously
  seedAdmin();
}

module.exports = app;
