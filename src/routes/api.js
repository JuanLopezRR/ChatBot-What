const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runSql } = require('../database/init');
const { format } = require('date-fns');

router.get('/health', async (req, res) => {
  try {
    await queryOne('SELECT 1');
    res.json({
      status: 'healthy',
      database: 'postgresql',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', database: error.message });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const { date, status, phone } = req.query;
    
    let query = `
      SELECT a.*, c.name as client_name, c.phone as client_phone
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (phone) {
      query += ` AND c.phone = $${idx}`;
      params.push(phone);
      idx++;
    }

    if (date) {
      query += ` AND a.date = $${idx}`;
      params.push(date);
      idx++;
    } else {
      query += ` AND a.date >= $${idx}`;
      params.push(format(new Date(), 'yyyy-MM-dd'));
      idx++;
    }

    if (status) {
      query += ` AND a.status = $${idx}`;
      params.push(status);
      idx++;
    }

    query += ' ORDER BY a.date ASC, a.time ASC';

    const result = await queryAll(query, params);
    res.json({ appointments: result, total: result.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/appointments/:id', async (req, res) => {
  try {
    const apt = await queryOne(
      'SELECT a.*, c.name as client_name, c.phone as client_phone FROM appointments a JOIN clients c ON a.client_id = c.id WHERE a.id = $1',
      [req.params.id]
    );
    if (!apt) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(apt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/appointments', async (req, res) => {
  try {
    const { client_phone, client_name, service_name, date, time, description, notes } = req.body;
    
    if (!client_phone || !service_name || !date || !time) {
      return res.status(400).json({ error: 'Faltan campos: client_phone, service_name, date, time' });
    }

    let client = await queryOne('SELECT id FROM clients WHERE phone = $1', [client_phone]);
    if (!client) {
      const result = await runSql('INSERT INTO clients (phone, name) VALUES ($1, $2) RETURNING id', [client_phone, client_name || 'Cliente']);
      client = { id: result.lastId };
    }

    const service = await queryOne('SELECT duration_minutes FROM services WHERE name = $1', [service_name]);
    const duration = service ? service.duration_minutes : 60;

    const result = await runSql(
      'INSERT INTO appointments (client_id, service, date, time, duration_minutes, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [client.id, service_name, date, time, duration, notes]
    );
    
    res.status(201).json({ id: result.lastId, message: 'Cita creada exitosamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/appointments/:id/confirm', async (req, res) => {
  try {
    await runSql("UPDATE appointments SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    res.json({ message: 'Cita confirmada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/appointments/:id/cancel', async (req, res) => {
  try {
    await runSql("UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    res.json({ message: 'Cita cancelada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services', async (req, res) => {
  try {
    const services = await queryAll('SELECT * FROM services WHERE active = 1 ORDER BY name');
    res.json({ services });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slots', async (req, res) => {
  try {
    const { date, service_id } = req.query;
    if (!date || !service_id) {
      return res.status(400).json({ error: 'Faltan date y service_id' });
    }

    const dateObj = new Date(date + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0) return res.json({ slots: [], total: 0 });

    const hours = dayOfWeek === 6 ? { start: 9, end: 13 } : { start: 8, end: 18 };
    const service = await queryOne('SELECT duration_minutes FROM services WHERE id = $1', [service_id]);
    const duration = service ? service.duration_minutes : 60;

    const blocked = await queryAll('SELECT time_start, time_end FROM blocked_times WHERE date = $1', [date]);
    const appointments = await queryAll("SELECT time, duration_minutes FROM appointments WHERE date = $1 AND status != 'cancelled'", [date]);

    const slots = [];
    const startMinutes = hours.start * 60;
    const endMinutes = hours.end * 60;

    for (let m = startMinutes; m + duration <= endMinutes; m += 30) {
      const slotStart = `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
      const slotEnd = `${Math.floor((m+duration)/60).toString().padStart(2,'0')}:${((m+duration)%60).toString().padStart(2,'0')}`;

      const isBlocked = blocked.some(b => slotStart < b.time_end && slotEnd > b.time_start);
      const isOccupied = appointments.some(a => {
        const apptStart = a.time.substring(0, 5);
        const apptEndMin = parseInt(apptStart.split(':')[0]) * 60 + parseInt(apptStart.split(':')[1]) + a.duration_minutes;
        const apptEnd = `${Math.floor(apptEndMin/60).toString().padStart(2,'0')}:${(apptEndMin%60).toString().padStart(2,'0')}`;
        return slotStart < apptEnd && slotEnd > apptStart;
      });

      if (!isBlocked && !isOccupied) {
        slots.push({ start: slotStart, end: slotEnd });
      }
    }

    res.json({ date, service_id: parseInt(service_id), slots, total: slots.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const stats = {
      totalAppointments: (await queryOne("SELECT COUNT(*) as count FROM appointments")).count,
      todayAppointments: (await queryOne("SELECT COUNT(*) as count FROM appointments WHERE date = $1", [today])).count,
      pendingAppointments: (await queryOne("SELECT COUNT(*) as count FROM appointments WHERE status = 'pending'")).count,
      confirmedAppointments: (await queryOne("SELECT COUNT(*) as count FROM appointments WHERE status = 'confirmed'")).count,
      totalClients: (await queryOne("SELECT COUNT(*) as count FROM clients")).count
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients', async (req, res) => {
  try {
    const clients = await queryAll('SELECT * FROM clients ORDER BY created_at DESC LIMIT 50');
    res.json({ clients, total: clients.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
      SELECT * FROM citas ORDER BY id DESC LIMIT 20
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
