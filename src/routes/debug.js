const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../database/init');

router.get('/debug/clients', async (req, res) => {
  try {
    const clients = await queryAll('SELECT * FROM clients ORDER BY id');
    res.json({ total: clients.length, clients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/debug/appointments', async (req, res) => {
  try {
    const appointments = await queryAll(`
      SELECT a.*, c.name as client_name, c.phone as client_phone
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      ORDER BY a.date DESC
      LIMIT 20
    `);
    res.json({ total: appointments.length, appointments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/debug/services', async (req, res) => {
  try {
    const services = await queryAll('SELECT * FROM services');
    res.json({ total: services.length, services });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
