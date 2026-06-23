require('dotenv').config();
const { Pool, types } = require('pg');

// Parse PostgreSQL BIGINT as JS number (pg returns them as strings by default)
types.setTypeParser(20, val => parseInt(val, 10));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = {
  async one(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0] ?? null;
  },
  async all(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
  },
  async run(text, params = []) {
    return await pool.query(text, params);
  }
};

module.exports = db;
