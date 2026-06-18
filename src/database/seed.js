const { initDatabase, queryAll, queryOne, runSql, closeDb } = require('./init');

const SERVICES = [
  { name: 'Reparación de Computadores', description: 'Diagnóstico y reparación de PCs de escritorio y portátiles', duration_minutes: 90 },
  { name: 'Soporte de Impresoras', description: 'Instalación, configuración y reparación de impresoras', duration_minutes: 60 },
  { name: 'Desarrollo Web', description: 'Diseño y desarrollo de páginas web profesionales', duration_minutes: 120 },
  { name: 'Software POS', description: 'Instalación y configuración de software punto de venta', duration_minutes: 90 },
  { name: 'Soporte Técnico General', description: 'Asesoría y soporte técnico especializado', duration_minutes: 45 },
  { name: 'Soluciones Tecnológicas', description: 'Consultoría e implementación de soluciones IT', duration_minutes: 60 },
  { name: 'Mantenimiento Preventivo', description: 'Limpieza y optimización de equipos', duration_minutes: 60 },
  { name: 'Recuperación de Datos', description: 'Recuperación de información de discos dañados', duration_minutes: 120 }
];

async function seed() {
  await initDatabase();

  for (const svc of SERVICES) {
    const existing = queryOne('SELECT id FROM services WHERE name = ?', [svc.name]);
    if (!existing) {
      runSql(
        'INSERT INTO services (name, description, duration_minutes) VALUES (?, ?, ?)',
        [svc.name, svc.description, svc.duration_minutes]
      );
    }
  }

  console.log(`✅ ${SERVICES.length} servicios insertados/verificados`);
  
  const count = queryOne('SELECT COUNT(*) as total FROM services');
  console.log(`📊 Total servicios en base de datos: ${count.total}`);
  
  closeDb();
}

seed().catch(console.error);
