require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initDatabase, closeDb } = require('./database/init');
const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({
    service: 'ChatBot WhatsApp Lopez Tech',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      webhook: '/webhook/whatsapp',
      health: '/api/health',
      appointments: '/api/appointments',
      stats: '/api/stats'
    }
  });
});

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function start() {
  try {
    await initDatabase();
    logger.info('Base de datos inicializada');
    
    app.listen(PORT, () => {
      logger.info(`Servidor ChatBot ejecutándose en puerto ${PORT}`);
      console.log(`\n🚀 ChatBot WhatsApp Lopez Tech - Puerto ${PORT}`);
      console.log(`📱 Webhook: http://localhost:${PORT}/webhook/whatsapp`);
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
