const { initDatabase, queryAll, queryOne, closeDb } = require('./init');

async function migrate() {
  await initDatabase();
  
  console.log('🔄 Ejecutando migraciones...');
  
  const tables = queryAll("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('📊 Tablas existentes:', tables.map(t => t.name).join(', '));
  
  const counts = {};
  for (const table of tables) {
    if (!['sqlite_sequence', 'sqlite_stat1', 'sqlite_stat2'].includes(table.name)) {
      const count = queryOne(`SELECT COUNT(*) as count FROM "${table.name}"`);
      counts[table.name] = count.count;
    }
  }
  console.log('📈 Registros por tabla:', counts);
  
  console.log('✅ Migraciones completadas');
  closeDb();
}

migrate().catch(console.error);
