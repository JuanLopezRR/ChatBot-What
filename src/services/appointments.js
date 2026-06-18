const { queryAll, queryOne, runSql } = require('../database/init');
const { logger } = require('../utils/logger');
const { format, addDays } = require('date-fns');

class AppointmentService {
  constructor() {
    this.BUSINESS_HOURS = {
      weekday: { start: 8, end: 18 },
      saturday: { start: 9, end: 13 }
    };
  }

  getAvailableSlots(dateStr, serviceId) {
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();

    let hours;
    if (dayOfWeek === 0) return [];
    if (dayOfWeek === 6) {
      hours = this.BUSINESS_HOURS.saturday;
    } else {
      hours = this.BUSINESS_HOURS.weekday;
    }

    const service = queryOne('SELECT duration_minutes FROM services WHERE id = ?', [serviceId]);
    const duration = service ? service.duration_minutes : 60;

    const blocked = queryAll(
      'SELECT time_start, time_end FROM blocked_times WHERE date = ?',
      [dateStr]
    );

    const appointmentsList = queryAll(
      "SELECT time, duration_minutes FROM appointments WHERE date = ? AND status != 'cancelled'",
      [dateStr]
    );

    const slots = [];
    const startMinutes = hours.start * 60;
    const endMinutes = hours.end * 60;

    for (let m = startMinutes; m + duration <= endMinutes; m += 30) {
      const slotStart = this.minutesToTime(m);
      const slotEnd = this.minutesToTime(m + duration);

      const isBlocked = blocked.some(b => 
        this.timeOverlaps(slotStart, slotEnd, b.time_start, b.time_end)
      );

      const isOccupied = appointmentsList.some(a => {
        const apptStart = a.time.substring(0, 5);
        const apptEnd = this.minutesToTime(
          this.timeToMinutes(apptStart) + a.duration_minutes
        );
        return this.timeOverlaps(slotStart, slotEnd, apptStart, apptEnd);
      });

      if (!isBlocked && !isOccupied) {
        slots.push({ start: slotStart, end: slotEnd });
      }
    }

    return slots;
  }

  createAppointment(clientId, serviceName, date, time, description, notes) {
    const service = queryOne('SELECT duration_minutes FROM services WHERE name = ?', [serviceName]);
    const duration = service ? service.duration_minutes : 60;

    const result = runSql(
      `INSERT INTO appointments (client_id, service, description, date, time, duration_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clientId, serviceName, description, date, time, duration, notes]
    );

    logger.info(`Cita creada: ID ${result.lastId} para ${date} ${time}`);
    return result.lastId;
  }

  confirmAppointment(appointmentId) {
    runSql("UPDATE appointments SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?", [appointmentId]);
    logger.info(`Cita ${appointmentId} confirmada`);
  }

  cancelAppointment(appointmentId) {
    runSql("UPDATE appointments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [appointmentId]);
    logger.info(`Cita ${appointmentId} cancelada`);
  }

  completeAppointment(appointmentId) {
    runSql("UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [appointmentId]);
  }

  getClientAppointments(clientId, upcoming = true) {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    if (upcoming) {
      return queryAll(
        `SELECT * FROM appointments 
         WHERE client_id = ? AND date >= ? AND status IN ('pending', 'confirmed')
         ORDER BY date ASC, time ASC`,
        [clientId, today]
      );
    }
    return queryAll(
      `SELECT * FROM appointments 
       WHERE client_id = ? AND (date < ? OR (date = ? AND status = 'completed'))
       ORDER BY date DESC, time DESC LIMIT 10`,
      [clientId, today, today]
    );
  }

  getAppointmentById(id) {
    return queryOne(
      `SELECT a.*, c.name as client_name, c.phone as client_phone
       FROM appointments a
       JOIN clients c ON a.client_id = c.id
       WHERE a.id = ?`,
      [id]
    );
  }

  getDailyAppointments(date) {
    return queryAll(
      `SELECT a.*, c.name as client_name, c.phone as client_phone
       FROM appointments a
       JOIN clients c ON a.client_id = c.id
       WHERE a.date = ? AND a.status IN ('pending', 'confirmed')
       ORDER BY a.time ASC`,
      [date]
    );
  }

  timeOverlaps(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
  }

  minutesToTime(minutes) {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  formatTime12(time24) {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  }
}

module.exports = new AppointmentService();
