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

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Computes No Roster / Absent / Late / Miss Punch counts for today across a set of OEs
async function computeOeStats(oeIds, today) {
  if (!oeIds.length) return { no_roster: 0, absent: 0, late: 0, miss_punch: 0 };
  const placeholders = oeIds.map((_, i) => `$${i + 2}`).join(',');
  const [rosterRows, attRows] = await Promise.all([
    db.all(`SELECT * FROM roster WHERE date=$1 AND oe_id IN (${placeholders})`, [today, ...oeIds]),
    db.all(`SELECT * FROM attendance WHERE date=$1 AND user_id IN (${placeholders}) ORDER BY check_in_time`, [today, ...oeIds]),
  ]);

  const rosterByOe = {};
  rosterRows.forEach(r => { rosterByOe[r.oe_id] = r; });
  const attByOe = {};
  attRows.forEach(a => { (attByOe[a.user_id] = attByOe[a.user_id] || []).push(a); });

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const GRACE_MIN = 15;

  let no_roster = 0, absent = 0, late = 0, miss_punch = 0;

  oeIds.forEach(id => {
    const roster = rosterByOe[id];
    if (!roster) { no_roster++; return; }
    if (!['normal', 'OT'].includes(roster.day_type)) return;

    const visits = attByOe[id] || [];
    if (visits.length === 0) { absent++; return; }

    const firstCheckIn = visits[0];
    const shiftStartMin = timeToMinutes(roster.shift_start);
    if (shiftStartMin != null && firstCheckIn.check_in_time) {
      const ci = new Date(firstCheckIn.check_in_time);
      const ciMin = ci.getHours() * 60 + ci.getMinutes();
      if (ciMin > shiftStartMin + GRACE_MIN) late++;
    }

    const shiftEndMin = timeToMinutes(roster.shift_end);
    const hasOpenVisit = visits.some(v => v.check_in_time && !v.check_out_time);
    if (hasOpenVisit && shiftEndMin != null && nowMinutes > shiftEndMin + GRACE_MIN) miss_punch++;
  });

  return { no_roster, absent, late, miss_punch };
}

router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const [mgr, oe, st, ci, co, activeOes] = await Promise.all([
      db.one("SELECT COUNT(*)::int AS c FROM users WHERE role='manager' AND is_active=1"),
      db.one("SELECT COUNT(*)::int AS c FROM users WHERE role='oe' AND is_active=1"),
      db.one('SELECT COUNT(*)::int AS c FROM stores'),
      db.one('SELECT COUNT(*)::int AS c FROM attendance WHERE date=$1 AND check_in_time IS NOT NULL', [today]),
      db.one('SELECT COUNT(*)::int AS c FROM attendance WHERE date=$1 AND check_out_time IS NOT NULL', [today]),
      db.all("SELECT id FROM users WHERE role='oe' AND is_active=1"),
    ]);
    const oeStats = await computeOeStats(activeOes.map(o => o.id), today);
    res.json({ total_managers: mgr.c, total_oes: oe.c, total_stores: st.c, today_checkins: ci.c, today_checkouts: co.c, ...oeStats });
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

// Absent today (rostered but not checked in)
router.get('/absent-today', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const rows = await db.all(`
      SELECT u.id, u.name, r.shift_start, r.shift_end, r.day_type,
             s.store_code, m.name AS manager_name
      FROM roster r
      JOIN users u ON u.id = r.oe_id
      LEFT JOIN stores s ON s.id = u.store_id
      LEFT JOIN users m ON m.id = u.manager_id
      LEFT JOIN attendance a ON a.user_id = r.oe_id AND a.date = $1
      WHERE r.date = $1
        AND r.day_type IN ('normal', 'OT')
        AND u.is_active = 1
        AND a.id IS NULL
      ORDER BY m.name, r.shift_start NULLS LAST, u.name
    `, [today]);
    res.json(rows);
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
