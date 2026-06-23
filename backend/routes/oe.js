const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('oe'));

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayLocal() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

router.get('/profile', async (req, res) => {
  try {
    res.json(await db.one(`
      SELECT u.id, u.name, u.email, u.store_id,
        s.store_code, s.name AS store_name, s.latitude, s.longitude, s.radius_meters,
        m.name AS manager_name
      FROM users u
      LEFT JOIN stores s ON s.id = u.store_id
      LEFT JOIN users m ON m.id = u.manager_id
      WHERE u.id = $1
    `, [req.user.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/today', async (req, res) => {
  try {
    const today = todayLocal();
    const [attendance, roster] = await Promise.all([
      db.one('SELECT * FROM attendance WHERE user_id = $1 AND date = $2', [req.user.id, today]),
      db.one(`
        SELECT r.*, s.store_code FROM roster r
        LEFT JOIN stores s ON s.id = r.store_id
        WHERE r.oe_id = $1 AND r.date = $2
      `, [req.user.id, today])
    ]);
    res.json({ attendance, roster, today });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkin', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ error: 'GPS location required' });

    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user.store_id) return res.status(400).json({ error: 'No store assigned. Contact your manager.' });

    const store = await db.one('SELECT * FROM stores WHERE id = $1', [user.store_id]);
    const distance = haversine(parseFloat(latitude), parseFloat(longitude), store.latitude, store.longitude);

    if (distance > store.radius_meters) {
      return res.status(400).json({
        error: `You are ${Math.round(distance)}m away from ${store.store_code}. Must be within ${store.radius_meters}m to check in.`,
        distance: Math.round(distance),
        required: store.radius_meters,
        outside_fence: true
      });
    }

    const today = todayLocal();
    const existing = await db.one('SELECT * FROM attendance WHERE user_id = $1 AND date = $2', [req.user.id, today]);
    if (existing?.check_in_time) return res.status(400).json({ error: 'Already checked in today' });

    const now = new Date().toISOString();
    if (existing) {
      await db.run(
        'UPDATE attendance SET check_in_time=$1, check_in_lat=$2, check_in_lng=$3, check_in_distance=$4, store_id=$5 WHERE id=$6',
        [now, latitude, longitude, distance, user.store_id, existing.id]
      );
    } else {
      await db.run(
        'INSERT INTO attendance (user_id, store_id, check_in_time, check_in_lat, check_in_lng, check_in_distance, date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.user.id, user.store_id, now, latitude, longitude, distance, today]
      );
    }
    res.json({ message: 'Checked in successfully', time: now, distance: Math.round(distance) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkout', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ error: 'GPS location required' });

    const today = todayLocal();
    const record = await db.one('SELECT * FROM attendance WHERE user_id = $1 AND date = $2', [req.user.id, today]);
    if (!record?.check_in_time) return res.status(400).json({ error: 'You have not checked in today' });
    if (record.check_out_time) return res.status(400).json({ error: 'Already checked out today' });

    const user = await db.one('SELECT store_id FROM users WHERE id = $1', [req.user.id]);
    let distance = null;
    if (user.store_id) {
      const store = await db.one('SELECT * FROM stores WHERE id = $1', [user.store_id]);
      if (store) distance = haversine(parseFloat(latitude), parseFloat(longitude), store.latitude, store.longitude);
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE attendance SET check_out_time=$1, check_out_lat=$2, check_out_lng=$3, check_out_distance=$4 WHERE id=$5',
      [now, latitude, longitude, distance, record.id]
    );
    res.json({ message: 'Checked out successfully', time: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/attendance', async (req, res) => {
  try {
    res.json(await db.all(`
      SELECT a.*, s.store_code FROM attendance a
      LEFT JOIN stores s ON s.id = a.store_id
      WHERE a.user_id = $1 ORDER BY a.date DESC LIMIT 30
    `, [req.user.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
