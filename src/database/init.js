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
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_history_phone ON chat_history(phone)');

    // Columna human_mode para cuando el admin toma el control
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_mode BOOLEAN DEFAULT FALSE
    `);

    // Tabla de configuración del bot
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insertar default paused = false si no existe
    await client.query(`
      INSERT INTO bot_settings (key, value) VALUES ('paused', 'false')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('✅ Base de datos inicializada');
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

async function getSetting(key) {
  const row = await queryOne('SELECT value FROM bot_settings WHERE key = $1', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await runSql('INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP', [key, value]);
}

async function isBotPaused() {
  const val = await getSetting('paused');
  return val === 'true';
}

module.exports = { initDatabase, queryAll, queryOne, runSql, closeDb, getSetting, setSetting, isBotPaused };
