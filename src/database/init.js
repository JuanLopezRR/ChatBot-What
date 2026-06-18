const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/chatbot.db';

let db = null;
let dbReady = false;

async function getDb() {
  if (!db) {
    await initDatabase();
  }
  return db;
}

async function initDatabase() {
  const SQL = await initSqlJs();
  
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const dbPath = path.resolve(DB_PATH);
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'Cliente',
      email TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      service TEXT NOT NULL,
      description TEXT,
      date DATE NOT NULL,
      time TIME NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      state TEXT DEFAULT 'idle',
      context TEXT DEFAULT '{}',
      last_message_at DATETIME DEFAULT (datetime('now')),
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      duration_minutes INTEGER DEFAULT 60,
      active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blocked_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      time_start TIME NOT NULL,
      time_end TIME NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone)`);
  } catch (e) {
    // Indexes may already exist
  }

  saveDatabase();
  dbReady = true;
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(path.resolve(DB_PATH), buffer);
  }
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return { changes: db.getRowsModified(), lastId: queryOne('SELECT last_insert_rowid() as id')?.id };
}

function closeDb() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

module.exports = { getDb, initDatabase, closeDb, saveDatabase, queryAll, queryOne, runSql };
