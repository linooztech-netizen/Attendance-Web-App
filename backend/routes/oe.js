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
  return new Date().toLocaleDateString('en-CA');
}

// Returns all stores assigned to this OE (primary store + oe_stores table)
async function getAssignedStores(oeId) {
  return db.all(`
    SELECT DISTINCT s.id, s.store_code, s.name, s.latitude, s.longitude, s.radius_meters
    FROM stores s
    WHERE s.id IN (
      SELECT store_id FROM oe_stores WHERE oe_id = $1
      UNION
      SELECT store_id FROM users WHERE id = $1 AND store_id IS NOT NULL
    )
    ORDER BY s.store_code
  `, [oeId]);
}

router.get('/profile', async (req, res) => {
  try {
    const user = await db.one(`
      SELECT u.id, u.name, u.email, u.store_id, u.device_fingerprint, u.device_name,
        s.store_code, s.name AS store_name, s.latitude, s.longitude, s.radius_meters,
        m.name AS manager_name
      FROM users u
      LEFT JOIN stores s ON s.id = u.store_id
      LEFT JOIN users m ON m.id = u.manager_id
      WHERE u.id = $1
    `, [req.user.id]);
    const assigned_stores = await getAssignedStores(req.user.id);
    res.json({ ...user, assigned_stores });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/today', async (req, res) => {
  try {
    const today = todayLocal();
    const [visits, roster] = await Promise.all([
      db.all(`
        SELECT a.*, s.store_code, s.name AS store_name
        FROM attendance a
        LEFT JOIN stores s ON s.id = a.store_id
        WHERE a.user_id = $1 AND a.date = $2
        ORDER BY a.check_in_time
      `, [req.user.id, today]),
      db.one(`
        SELECT r.*, s.store_code FROM roster r
        LEFT JOIN stores s ON s.id = r.store_id
        WHERE r.oe_id = $1 AND r.date = $2
      `, [req.user.id, today])
    ]);
    const openVisit = visits.find(v => v.check_in_time && !v.check_out_time) || null;
    res.json({ visits, openVisit, roster, today });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkin', async (req, res) => {
  try {
    const { latitude, longitude, device_fingerprint, device_name, store_id } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ error: 'GPS location required' });
    if (!store_id) return res.status(400).json({ error: 'Please select a store to check in.' });

    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);

    // Verify OE is assigned to this store
    const assignedStores = await getAssignedStores(req.user.id);
    const store = assignedStores.find(s => s.id == store_id);
    if (!store) {
      const storeInfo = await db.one('SELECT * FROM stores WHERE id=$1', [store_id]);
      if (!storeInfo) return res.status(400).json({ error: 'Store not found.' });
      return res.status(400).json({ error: `You are not assigned to ${storeInfo.store_code}.` });
    }

    const distance = haversine(parseFloat(latitude), parseFloat(longitude), store.latitude, store.longitude);
    if (distance > store.radius_meters) {
      return res.status(400).json({
        error: `You are ${Math.round(distance)}m away from ${store.store_code}. Must be within ${store.radius_meters}m to check in.`,
        distance: Math.round(distance),
        required: store.radius_meters,
        outside_fence: true
      });
    }

    // Device verification
    if (device_fingerprint) {
      if (!user.device_fingerprint) {
        await db.run('UPDATE users SET device_fingerprint=$1, device_name=$2 WHERE id=$3',
          [device_fingerprint, device_name || 'Unknown', req.user.id]);
      } else if (user.device_fingerprint !== device_fingerprint) {
        const approved = await db.one(`
          SELECT * FROM device_requests
          WHERE oe_id=$1 AND device_fingerprint=$2 AND status='approved'
          ORDER BY approved_at DESC LIMIT 1
        `, [req.user.id, device_fingerprint]);

        if (!approved) {
          const pending = await db.one(`
            SELECT id FROM device_requests WHERE oe_id=$1 AND device_fingerprint=$2 AND status='pending'
          `, [req.user.id, device_fingerprint]);
          if (!pending) {
            await db.run('INSERT INTO device_requests (oe_id, device_fingerprint, device_name) VALUES ($1,$2,$3)',
              [req.user.id, device_fingerprint, device_name || 'Unknown']);
          }
          return res.status(403).json({
            error: 'This device is not registered. A request has been sent to your manager for approval.',
            device_not_authorized: true
          });
        }
        await db.run('UPDATE users SET device_fingerprint=$1, device_name=$2 WHERE id=$3',
          [device_fingerprint, device_name || 'Unknown', req.user.id]);
      }
    }

    const today = todayLocal();
    // Check no open visit at this store today
    const openAtStore = await db.one(
      'SELECT id FROM attendance WHERE user_id=$1 AND store_id=$2 AND date=$3 AND check_out_time IS NULL',
      [req.user.id, store_id, today]
    );
    if (openAtStore) return res.status(400).json({ error: `Already checked in at ${store.store_code}. Please check out first.` });

    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO attendance (user_id, store_id, check_in_time, check_in_lat, check_in_lng, check_in_distance, date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, store_id, now, latitude, longitude, distance, today]
    );

    res.json({ message: `Checked in at ${store.store_code}`, time: now, distance: Math.round(distance) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkout', async (req, res) => {
  try {
    const { latitude, longitude, device_fingerprint } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ error: 'GPS location required' });

    // Device lock — must check out from registered device
    const user = await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (user.device_fingerprint && device_fingerprint && user.device_fingerprint !== device_fingerprint) {
      return res.status(403).json({
        error: 'Check-out must be done from your registered device.',
        device_not_authorized: true
      });
    }

    const today = todayLocal();
    const record = await db.one(
      'SELECT * FROM attendance WHERE user_id=$1 AND date=$2 AND check_out_time IS NULL ORDER BY check_in_time DESC LIMIT 1',
      [req.user.id, today]
    );
    if (!record) return res.status(400).json({ error: 'No active check-in found. Please check in first.' });

    if (!record.store_id) return res.status(400).json({ error: 'Store not found for this visit.' });

    const store = await db.one('SELECT * FROM stores WHERE id=$1', [record.store_id]);
    const distance = haversine(parseFloat(latitude), parseFloat(longitude), store.latitude, store.longitude);

    if (distance > store.radius_meters) {
      return res.status(400).json({
        error: `You are ${Math.round(distance)}m away from ${store.store_code}. Must be within ${store.radius_meters}m to check out.`,
        distance: Math.round(distance),
        required: store.radius_meters,
        outside_fence: true
      });
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
      WHERE a.user_id=$1 ORDER BY a.check_in_time DESC LIMIT 60
    `, [req.user.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
