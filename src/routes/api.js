const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../database/init');
const appointments = require('../services/appointments');
const clients = require('../services/clients');
const serviceCatalog = require('../services/services');
const { format } = require('date-fns');

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

router.get('/appointments', (req, res) => {
  try {
    const { date, status } = req.query;
    
    let query = `
      SELECT a.*, c.name as client_name, c.phone as client_phone
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ' AND a.date = ?';
      params.push(date);
    } else {
      query += ' AND a.date >= ?';
      params.push(format(new Date(), 'yyyy-MM-dd'));
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    query += ' ORDER BY a.date ASC, a.time ASC';

    const result = queryAll(query, params);
    res.json({ appointments: result, total: result.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/appointments/:id', (req, res) => {
  try {
    const apt = appointments.getAppointmentById(parseInt(req.params.id));
    if (!apt) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(apt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/appointments', (req, res) => {
  try {
    const { client_phone, client_name, service_name, date, time, description, notes } = req.body;
    
    if (!client_phone || !service_name || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos requeridos: client_phone, service_name, date, time' });
    }

    const client = clients.getOrCreateClient(client_phone, client_name || 'Cliente');
    const id = appointments.createAppointment(client.id, service_name, date, time, description, notes);
    
    res.status(201).json({ id, message: 'Cita creada exitosamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/appointments/:id/confirm', (req, res) => {
  try {
    appointments.confirmAppointment(parseInt(req.params.id));
    res.json({ message: 'Cita confirmada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/appointments/:id/cancel', (req, res) => {
  try {
    appointments.cancelAppointment(parseInt(req.params.id));
    res.json({ message: 'Cita cancelada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slots', (req, res) => {
  try {
    const { date, service_id } = req.query;
    if (!date || !service_id) {
      return res.status(400).json({ error: 'Faltan date y service_id' });
    }
    const slots = appointments.getAvailableSlots(date, parseInt(service_id));
    res.json({ date, service_id: parseInt(service_id), slots, total: slots.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services', (req, res) => {
  try {
    const services = serviceCatalog.getAll();
    res.json({ services });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients', (req, res) => {
  try {
    const allClients = clients.getAllClients();
    res.json({ clients: allClients, total: allClients.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const stats = {
      totalAppointments: queryOne("SELECT COUNT(*) as count FROM appointments").count,
      todayAppointments: queryOne("SELECT COUNT(*) as count FROM appointments WHERE date = ?", [today]).count,
      pendingAppointments: queryOne("SELECT COUNT(*) as count FROM appointments WHERE status = 'pending'").count,
      confirmedAppointments: queryOne("SELECT COUNT(*) as count FROM appointments WHERE status = 'confirmed'").count,
      cancelledAppointments: queryOne("SELECT COUNT(*) as count FROM appointments WHERE status = 'cancelled'").count,
      totalClients: queryOne("SELECT COUNT(*) as count FROM clients").count,
      newClientsThisWeek: queryOne("SELECT COUNT(*) as count FROM clients WHERE created_at > datetime('now', '-7 days')").count
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
