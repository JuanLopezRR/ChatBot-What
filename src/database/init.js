const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function initDatabase() {
  const client = await getPool().connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        name TEXT DEFAULT 'Cliente',
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        service TEXT NOT NULL,
        description TEXT,
        date DATE NOT NULL,
        time TIME NOT NULL,
        duration_minutes INTEGER DEFAULT 60,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        state TEXT DEFAULT 'idle',
        context TEXT DEFAULT '{}',
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        duration_minutes INTEGER DEFAULT 60,
        active INTEGER DEFAULT 1
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_times (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time_start TIME NOT NULL,
        time_end TIME NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_history_phone ON chat_history(phone)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone)');

    console.log('✅ Base de datos PostgreSQL inicializada');
  } finally {
    client.release();
  }
}

async function queryAll(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows[0] || null;
}

async function runSql(sql, params = []) {
  const result = await getPool().query(sql, params);
  return { changes: result.rowCount, lastId: result.rows[0]?.id || null };
}

function closeDb() {
  if (pool) {
    pool.end();
    pool = null;
  }
}

module.exports = { initDatabase, queryAll, queryOne, runSql, closeDb };
