const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

function buildSet(obj) {
  const keys = Object.keys(obj);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  return { sets, values: keys.map(k => obj[k]) };
}

router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const [mgr, oe, st, ci, co] = await Promise.all([
      db.one("SELECT COUNT(*)::int AS c FROM users WHERE role='manager' AND is_active=1"),
      db.one("SELECT COUNT(*)::int AS c FROM users WHERE role='oe' AND is_active=1"),
      db.one('SELECT COUNT(*)::int AS c FROM stores'),
      db.one('SELECT COUNT(*)::int AS c FROM attendance WHERE date=$1 AND check_in_time IS NOT NULL', [today]),
      db.one('SELECT COUNT(*)::int AS c FROM attendance WHERE date=$1 AND check_out_time IS NOT NULL', [today]),
    ]);
    res.json({ total_managers: mgr.c, total_oes: oe.c, total_stores: st.c, today_checkins: ci.c, today_checkouts: co.c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Managers
router.get('/managers', async (req, res) => {
  try {
    res.json(await db.all(`
      SELECT u.id, u.name, u.email, u.is_active, u.created_at,
        COUNT(oe.id)::int AS oe_count
      FROM users u
      LEFT JOIN users oe ON oe.manager_id = u.id AND oe.role = 'oe' AND oe.is_active = 1
      WHERE u.role = 'manager'
      GROUP BY u.id ORDER BY u.name
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/managers', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    const hash = await bcrypt.hash(password, 10);
    const r = await db.run(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'manager') RETURNING id",
      [name.trim(), email.toLowerCase().trim(), hash]
    );
    res.json({ id: r.rows[0].id, name, email, role: 'manager', is_active: 1 });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/managers/:id', async (req, res) => {
  try {
    const { name, email, is_active, password } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (email !== undefined) fields.email = email.toLowerCase().trim();
    if (is_active !== undefined) fields.is_active = is_active ? 1 : 0;
    if (password) fields.password_hash = await bcrypt.hash(password, 10);
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' });
    const { sets, values } = buildSet(fields);
    values.push(req.params.id);
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length} AND role = 'manager'`, values);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// OEs
router.get('/oes', async (req, res) => {
  try {
    res.json(await db.all(`
      SELECT u.id, u.name, u.email, u.is_active, u.created_at,
        m.name AS manager_name, s.store_code, s.name AS store_name
      FROM users u
      LEFT JOIN users m ON m.id = u.manager_id
      LEFT JOIN stores s ON s.id = u.store_id
      WHERE u.role = 'oe'
      ORDER BY m.name, u.name
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stores
router.get('/stores', async (req, res) => {
  try {
    res.json(await db.all(`
      SELECT s.*, u.name AS manager_name
      FROM stores s LEFT JOIN users u ON u.id = s.created_by
      ORDER BY s.store_code
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Attendance report
router.get('/attendance', async (req, res) => {
  try {
    const { from, to, format } = req.query;
    let q = `
      SELECT a.*, u.name AS oe_name, u.email AS oe_email,
        m.name AS manager_name, s.store_code
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN users m ON m.id = u.manager_id
      LEFT JOIN stores s ON s.id = a.store_id
      WHERE 1=1
    `;
    const params = [];
    if (from) { params.push(from); q += ` AND a.date >= $${params.length}`; }
    if (to)   { params.push(to);   q += ` AND a.date <= $${params.length}`; }
    q += ' ORDER BY a.date DESC, a.check_in_time DESC';

    const rows = await db.all(q, params);

    if (format === 'csv') {
      const fmt = iso => iso ? iso.replace('T', ' ').slice(0, 19) : '';
      const lines = [
        'Date,OE Name,OE Email,Manager,Store Code,Check In,Check Out,Check In Distance(m),Check Out Distance(m)',
        ...rows.map(r => [
          r.date, r.oe_name, r.oe_email, r.manager_name || '', r.store_code || '',
          fmt(r.check_in_time), fmt(r.check_out_time),
          r.check_in_distance != null ? Math.round(r.check_in_distance) : '',
          r.check_out_distance != null ? Math.round(r.check_out_distance) : ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${from}_to_${to}.csv"`);
      return res.send(lines);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
