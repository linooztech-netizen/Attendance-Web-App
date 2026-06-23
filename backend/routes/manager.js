const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('manager', 'admin'));

function buildSet(obj) {
  const keys = Object.keys(obj);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  return { sets, values: keys.map(k => obj[k]) };
}

// OEs
router.get('/oes', async (req, res) => {
  try {
    const mid = req.user.role === 'admin' && req.query.manager_id ? req.query.manager_id : req.user.id;
    res.json(await db.all(`
      SELECT u.id, u.name, u.email, u.is_active, u.store_id, u.created_at,
        s.store_code, s.name AS store_name
      FROM users u LEFT JOIN stores s ON s.id = u.store_id
      WHERE u.role = 'oe' AND u.manager_id = $1 ORDER BY u.name
    `, [mid]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/oes', async (req, res) => {
  try {
    const { name, email, password, store_id } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    const total = await db.one("SELECT COUNT(*)::int AS c FROM users WHERE role='oe' AND is_active=1");
    if (total.c >= 200) return res.status(400).json({ error: 'Maximum 200 active OEs reached' });
    const hash = await bcrypt.hash(password, 10);
    const r = await db.run(
      "INSERT INTO users (name, email, password_hash, role, manager_id, store_id) VALUES ($1,$2,$3,'oe',$4,$5) RETURNING id",
      [name.trim(), email.toLowerCase().trim(), hash, req.user.id, store_id || null]
    );
    res.json({ id: r.rows[0].id, name, email, role: 'oe', is_active: 1 });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/oes/:id', async (req, res) => {
  try {
    const { name, email, is_active, store_id, password } = req.body;
    if (req.user.role !== 'admin') {
      const oe = await db.one('SELECT id FROM users WHERE id=$1 AND manager_id=$2 AND role=$3', [req.params.id, req.user.id, 'oe']);
      if (!oe) return res.status(404).json({ error: 'OE not found' });
    }
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (email !== undefined) fields.email = email.toLowerCase().trim();
    if (is_active !== undefined) fields.is_active = is_active ? 1 : 0;
    if (store_id !== undefined) fields.store_id = store_id || null;
    if (password) fields.password_hash = await bcrypt.hash(password, 10);
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' });
    const { sets, values } = buildSet(fields);
    values.push(req.params.id);
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stores
router.get('/stores', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      res.json(await db.all(`
        SELECT s.*, u.name AS manager_name FROM stores s
        LEFT JOIN users u ON u.id = s.created_by ORDER BY s.store_code
      `));
    } else {
      res.json(await db.all(`
        SELECT s.*, u.name AS manager_name FROM stores s
        LEFT JOIN users u ON u.id = s.created_by WHERE s.created_by = $1 ORDER BY s.store_code
      `, [req.user.id]));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/stores', async (req, res) => {
  try {
    const { store_code, name, latitude, longitude, radius_meters } = req.body;
    if (!store_code || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Store code, latitude, longitude required' });
    }
    const r = await db.run(
      'INSERT INTO stores (store_code, name, latitude, longitude, radius_meters, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [store_code.trim().toUpperCase(), name || '', parseFloat(latitude), parseFloat(longitude), parseInt(radius_meters) || 100, req.user.id]
    );
    res.json({ id: r.rows[0].id, store_code, name, latitude, longitude, radius_meters: parseInt(radius_meters) || 100 });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Store code already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/stores/:id', async (req, res) => {
  try {
    const { store_code, name, latitude, longitude, radius_meters } = req.body;
    const fields = {};
    if (store_code !== undefined) fields.store_code = store_code.trim().toUpperCase();
    if (name !== undefined) fields.name = name;
    if (latitude !== undefined) fields.latitude = parseFloat(latitude);
    if (longitude !== undefined) fields.longitude = parseFloat(longitude);
    if (radius_meters !== undefined) fields.radius_meters = parseInt(radius_meters);
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' });
    const { sets, values } = buildSet(fields);
    values.push(req.params.id);
    await db.run(`UPDATE stores SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/stores/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM stores WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roster
router.get('/roster', async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = `
      SELECT r.*, u.name AS oe_name, s.store_code
      FROM roster r JOIN users u ON u.id = r.oe_id
      LEFT JOIN stores s ON s.id = r.store_id
      WHERE u.manager_id = $1
    `;
    const params = [req.user.id];
    if (from) { params.push(from); q += ` AND r.date >= $${params.length}`; }
    if (to)   { params.push(to);   q += ` AND r.date <= $${params.length}`; }
    q += ' ORDER BY r.date, u.name';
    res.json(await db.all(q, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/roster', async (req, res) => {
  try {
    const { oe_id, date, shift_start, shift_end, store_id, notes } = req.body;
    if (!oe_id || !date) return res.status(400).json({ error: 'OE and date required' });
    await db.run(`
      INSERT INTO roster (oe_id, store_id, date, shift_start, shift_end, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (oe_id, date) DO UPDATE SET
        store_id = EXCLUDED.store_id, shift_start = EXCLUDED.shift_start,
        shift_end = EXCLUDED.shift_end, notes = EXCLUDED.notes
    `, [oe_id, store_id || null, date, shift_start || null, shift_end || null, notes || null, req.user.id]);
    res.json({ message: 'Roster saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/roster/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM roster WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Attendance
router.get('/attendance', async (req, res) => {
  try {
    const { from, to, oe_id, format } = req.query;
    let q = `
      SELECT a.*, u.name AS oe_name, u.email AS oe_email, s.store_code
      FROM attendance a JOIN users u ON u.id = a.user_id
      LEFT JOIN stores s ON s.id = a.store_id
      WHERE u.manager_id = $1
    `;
    const params = [req.user.id];
    if (oe_id) { params.push(oe_id); q += ` AND a.user_id = $${params.length}`; }
    if (from)  { params.push(from);  q += ` AND a.date >= $${params.length}`; }
    if (to)    { params.push(to);    q += ` AND a.date <= $${params.length}`; }
    q += ' ORDER BY a.date DESC, a.check_in_time DESC';

    const rows = await db.all(q, params);

    if (format === 'csv') {
      const fmt = iso => iso ? iso.replace('T', ' ').slice(0, 19) : '';
      const lines = [
        'Date,OE Name,OE Email,Store Code,Check In,Check Out,Check In Distance(m),Check Out Distance(m)',
        ...rows.map(r => [
          r.date, r.oe_name, r.oe_email, r.store_code || '',
          fmt(r.check_in_time), fmt(r.check_out_time),
          r.check_in_distance != null ? Math.round(r.check_in_distance) : '',
          r.check_out_distance != null ? Math.round(r.check_out_distance) : ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
      return res.send(lines);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
