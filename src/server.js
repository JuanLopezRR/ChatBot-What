require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { initDatabase, closeDb, queryOne, runSql } = require('./database/init');
const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({
    service: 'ChatBot WhatsApp Lopez Tech',
    version: '1.0.0',
    status: 'running',
    database: 'postgresql',
    endpoints: {
      webhook: '/webhook/whatsapp',
      health: '/api/health',
      appointments: '/api/appointments',
      schedule: '/?#agendar'
    }
  });
});

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function seedServices() {
  const SERVICES = [
    { name: 'Reparación de Computadores', description: 'Diagnóstico y reparación de PCs', duration_minutes: 90 },
    { name: 'Soporte de Impresoras', description: 'Instalación y reparación de impresoras', duration_minutes: 60 },
    { name: 'Desarrollo Web', description: 'Diseño y desarrollo de páginas web', duration_minutes: 120 },
    { name: 'Software POS', description: 'Software punto de venta', duration_minutes: 90 },
    { name: 'Soporte Técnico General', description: 'Asesoría técnica especializada', duration_minutes: 45 },
    { name: 'Soluciones Tecnológicas', description: 'Consultoría IT', duration_minutes: 60 },
    { name: 'Mantenimiento Preventivo', description: 'Limpieza y optimización de equipos', duration_minutes: 60 },
    { name: 'Recuperación de Datos', description: 'Recuperación de información', duration_minutes: 120 }
  ];

  for (const svc of SERVICES) {
    const existing = await queryOne('SELECT id FROM services WHERE name = $1', [svc.name]);
    if (!existing) {
      await runSql('INSERT INTO services (name, description, duration_minutes) VALUES ($1, $2, $3)', [svc.name, svc.description, svc.duration_minutes]);
    }
  }
  logger.info('Servicios verificados');
}

async function start() {
  try {
    await initDatabase();
    await seedServices();
    
    app.listen(PORT, () => {
      logger.info(`Servidor ChatBot ejecutándose en puerto ${PORT}`);
      console.log(`\n🚀 ChatBot WhatsApp Lopez Tech - Puerto ${PORT}`);
      console.log(`📱 Webhook: http://localhost:${PORT}/webhook/whatsapp`);
      console.log(`🌐 Web: http://localhost:${PORT}/`);
      console.log(`📊 API: http://localhost:${PORT}/api/health\n`);
    });
  } catch (error) {
    logger.error('Error al iniciar servidor:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.log('Cerrando servidor...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.log('Cerrando servidor...');
  closeDb();
  process.exit(0);
});

start();
