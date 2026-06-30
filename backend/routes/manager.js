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

router.get('/oe-stats', async (req, res) => {
  try {
    const mid = req.user.role === 'admin' && req.query.manager_id ? req.query.manager_id : req.user.id;
    const today = new Date().toLocaleDateString('en-CA');
    const oes = await db.all("SELECT id FROM users WHERE role='oe' AND is_active=1 AND manager_id=$1", [mid]);
    res.json(await computeOeStats(oes.map(o => o.id), today));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// OEs
router.get('/oes', async (req, res) => {
  try {
    const mid = req.user.role === 'admin' && req.query.manager_id ? req.query.manager_id : req.user.id;
    res.json(await db.all(`
      SELECT u.id, u.name, u.email, u.is_active, u.store_id, u.device_fingerprint, u.device_name, u.created_at,
        s.store_code, s.name AS store_name
      FROM users u LEFT JOIN stores s ON s.id = u.store_id
      WHERE u.role='oe' AND u.manager_id=$1 ORDER BY u.name
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
      "INSERT INTO users (name,email,password_hash,role,manager_id,store_id) VALUES ($1,$2,$3,'oe',$4,$5) RETURNING id",
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
    const { name, email, is_active, store_id, password, device_name } = req.body;
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
    if (device_name !== undefined) fields.device_name = device_name || null;
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' });
    const { sets, values } = buildSet(fields);
    values.push(req.params.id);
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id=$${values.length}`, values);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// OE store assignments (multi-store)
router.get('/oes/:id/stores', async (req, res) => {
  try {
    const stores = await db.all(`
      SELECT DISTINCT s.id, s.store_code, s.name, s.radius_meters
      FROM stores s
      WHERE s.id IN (
        SELECT store_id FROM oe_stores WHERE oe_id = $1
        UNION
        SELECT store_id FROM users WHERE id = $1 AND store_id IS NOT NULL
      )
      ORDER BY s.store_code
    `, [req.params.id]);
    res.json(stores);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/oes/:id/stores', async (req, res) => {
  try {
    const { store_id } = req.body;
    if (!store_id) return res.status(400).json({ error: 'store_id required' });
    await db.run(
      'INSERT INTO oe_stores (oe_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, store_id]
    );
    res.json({ message: 'Store assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/oes/:id/stores/:storeId', async (req, res) => {
  try {
    await db.run('DELETE FROM oe_stores WHERE oe_id=$1 AND store_id=$2', [req.params.id, req.params.storeId]);
    await db.run('UPDATE users SET store_id=NULL WHERE id=$1 AND store_id=$2', [req.params.id, req.params.storeId]);
    res.json({ message: 'Store removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset OE device
router.delete('/oes/:id/device', async (req, res) => {
  try {
    await db.run('UPDATE users SET device_fingerprint=NULL, device_name=NULL WHERE id=$1', [req.params.id]);
    res.json({ message: 'Device reset. OE can register a new device on next check-in.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stores
router.get('/stores', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      res.json(await db.all('SELECT s.*, u.name AS manager_name FROM stores s LEFT JOIN users u ON u.id=s.created_by ORDER BY s.store_code'));
    } else {
      res.json(await db.all('SELECT s.*, u.name AS manager_name FROM stores s LEFT JOIN users u ON u.id=s.created_by WHERE s.created_by=$1 ORDER BY s.store_code', [req.user.id]));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/stores', async (req, res) => {
  try {
    const { store_code, name, latitude, longitude, radius_meters } = req.body;
    if (!store_code || latitude == null || longitude == null) return res.status(400).json({ error: 'Store code, latitude, longitude required' });
    const r = await db.run(
      'INSERT INTO stores (store_code,name,latitude,longitude,radius_meters,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
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
    await db.run(`UPDATE stores SET ${sets.join(', ')} WHERE id=$${values.length}`, values);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/stores/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM stores WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roster
router.get('/roster', async (req, res) => {
  try {
    const { from, to, oe_id } = req.query;
    let q = `SELECT r.*, u.name AS oe_name, s.store_code FROM roster r JOIN users u ON u.id=r.oe_id LEFT JOIN stores s ON s.id=r.store_id WHERE u.manager_id=$1`;
    const params = [req.user.id];
    if (oe_id) { params.push(oe_id); q += ` AND r.oe_id=$${params.length}`; }
    if (from)  { params.push(from);  q += ` AND r.date >= $${params.length}`; }
    if (to)    { params.push(to);    q += ` AND r.date <= $${params.length}`; }
    q += ' ORDER BY r.date, u.name';
    res.json(await db.all(q, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/roster', async (req, res) => {
  try {
    const { oe_id, date, shift_start, shift_end, store_id, notes, day_type } = req.body;
    if (!oe_id || !date) return res.status(400).json({ error: 'OE and date required' });
    await db.run(`
      INSERT INTO roster (oe_id,store_id,date,shift_start,shift_end,notes,day_type,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (oe_id, date) DO UPDATE SET
        store_id=EXCLUDED.store_id, shift_start=EXCLUDED.shift_start,
        shift_end=EXCLUDED.shift_end, notes=EXCLUDED.notes, day_type=EXCLUDED.day_type
    `, [oe_id, store_id || null, date, shift_start || null, shift_end || null, notes || null, day_type || 'normal', req.user.id]);
    res.json({ message: 'Roster saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/roster/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM roster WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Device Requests
router.get('/device-requests', async (req, res) => {
  try {
    res.json(await db.all(`
      SELECT dr.*, u.name AS oe_name, u.email AS oe_email
      FROM device_requests dr
      JOIN users u ON u.id = dr.oe_id
      WHERE u.manager_id = $1
      ORDER BY dr.requested_at DESC
    `, [req.user.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/device-requests/:id', async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'deny'
    if (!['approve', 'deny'].includes(action)) return res.status(400).json({ error: 'Action must be approve or deny' });

    const request = await db.one('SELECT * FROM device_requests WHERE id=$1', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const status = action === 'approve' ? 'approved' : 'denied';
    await db.run('UPDATE device_requests SET status=$1, approved_by=$2, approved_at=NOW() WHERE id=$3',
      [status, req.user.id, req.params.id]);

    if (action === 'approve') {
      // Update OE's primary device to the new device
      await db.run('UPDATE users SET device_fingerprint=$1, device_name=$2 WHERE id=$3',
        [request.device_fingerprint, request.device_name, request.oe_id]);
    }

    res.json({ message: action === 'approve' ? 'Device approved and registered' : 'Device request denied' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Absent today (rostered but not checked in)
router.get('/absent-today', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const rows = await db.all(`
      SELECT u.id, u.name, r.shift_start, r.shift_end, r.day_type, s.store_code
      FROM roster r
      JOIN users u ON u.id = r.oe_id
      LEFT JOIN stores s ON s.id = u.store_id
      LEFT JOIN attendance a ON a.user_id = r.oe_id AND a.date = $2
      WHERE u.manager_id = $1
        AND r.date = $2
        AND r.day_type IN ('normal', 'OT')
        AND u.is_active = 1
        AND a.id IS NULL
      ORDER BY r.shift_start NULLS LAST, u.name
    `, [req.user.id, today]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Attendance
router.get('/attendance', async (req, res) => {
  try {
    const { from, to, oe_id, format } = req.query;
    let q = `SELECT a.*, u.name AS oe_name, u.email AS oe_email, s.store_code FROM attendance a JOIN users u ON u.id=a.user_id LEFT JOIN stores s ON s.id=a.store_id WHERE u.manager_id=$1`;
    const params = [req.user.id];
    if (oe_id) { params.push(oe_id); q += ` AND a.user_id=$${params.length}`; }
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
