const axios = require('axios');
const { queryAll, queryOne, runSql } = require('../database/init');
const { format, addDays } = require('date-fns');
const { logger } = require('../utils/logger');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Eres Andres, asesor comercial de Lopez Tech en Santa Marta, Colombia. La empresa vende y repara computadores, impresoras, hace páginas web, software POS, soporte técnico y soluciones tecnológicas. Horario lunes-viernes 8am-6pm, sábados 9am-1pm.

Escribe como un profesional por WhatsApp: formal pero cercano, cordial, educado. USA USTED, NUNCA uses parcero, chevere ni jerga. Emojis solo si es natural (máximo 1-2). NUNCA eres IA, eres persona real.

REGLAS:
1) Saluda según hora Colombia (buenos días 6am-12pm, buenas tardes 12pm-7pm, buenas noches 7pm-6am).
2) Si ya hubo mensajes anteriores, NO vuelvas a saludar.
3) Respuestas MÁXIMO 3-4 líneas, nada de paredes de texto.
4) Muestra interés genuino en ayudar.
5) Si pregunta precios, di que depende del proyecto y ofrece asesoría personalizada.
6) Si quiere agendar cita, dile que escriba "agendar" para comenzar el proceso.
7) Si no sabes algo, di que lo consultas con el equipo.
8) Si preguntan por servicios, describe brevemente los que ofrece la empresa.`;

const STOP_WORDS = ['parar', 'cancelar', 'salir', 'stop', 'no quiero mensajes', 'cancela', 'cancel', 'detener', 'no mas', 'no más'];

const BOOKING_STATES = {
  IDLE: 'idle',
  MENU: 'menu',
  BOOKING_SERVICE: 'booking_service',
  BOOKING_DATE: 'booking_date',
  BOOKING_TIME: 'booking_time',
  BOOKING_CONFIRM: 'booking_confirm',
  CANCELLING: 'cancelling'
};

class GroqService {
  constructor() {
    this.client = axios.create({
      baseURL: GROQ_API_URL,
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async chat(messages, userName) {
    try {
      const historyText = messages.map(m => 
        `${m.role === 'user' ? userName : 'Andres'}: ${m.content}`
      ).join('\n');

      const response = await this.client.post('', {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\nCONVERSACIÓN:\n' + (historyText || 'Primera vez que habla con el cliente.') },
          messages[messages.length - 1]
        ],
        max_tokens: 200,
        temperature: 0.85
      });

      return response.data.choices?.[0]?.message?.content || 
        `Hola ${userName}, gracias por comunicarse con Lopez Tech. ¿En qué puedo ayudarle?`;
    } catch (error) {
      logger.error(`Error en Groq API: ${error.message}`);
      return `Hola ${userName}, gracias por comunicarse con Lopez Tech. ¿En qué puedo ayudarle?`;
    }
  }
}

class MessageHandler {
  constructor() {
    this.groq = new GroqService();
  }

  getConversationState(phone) {
    let conv = queryOne('SELECT * FROM conversations WHERE phone = ?', [phone]);
    if (!conv) {
      runSql('INSERT INTO conversations (phone, state, context) VALUES (?, ?, ?)', [phone, BOOKING_STATES.IDLE, '{}']);
      conv = queryOne('SELECT * FROM conversations WHERE phone = ?', [phone]);
    }
    return { ...conv, context: JSON.parse(conv.context || '{}') };
  }

  setConversationState(phone, state, context = {}) {
    runSql('UPDATE conversations SET state = ?, context = ?, last_message_at = datetime(\'now\') WHERE phone = ?', [state, JSON.stringify(context), phone]);
  }

  resetConversation(phone) {
    this.setConversationState(phone, BOOKING_STATES.IDLE, {});
  }

  getHistory(phone) {
    return queryAll(
      "SELECT role, content FROM chat_history WHERE phone = ? ORDER BY id ASC",
      [phone]
    ).slice(-20);
  }

  saveHistory(phone, role, content) {
    runSql("INSERT INTO chat_history (phone, role, content) VALUES (?, ?, ?)", [phone, role, content]);
    const count = queryOne("SELECT COUNT(*) as count FROM chat_history WHERE phone = ?", [phone]);
    if (count.count > 50) {
      runSql("DELETE FROM chat_history WHERE phone = ? AND id NOT IN (SELECT id FROM chat_history WHERE phone = ? ORDER BY id DESC LIMIT 30)", [phone, phone]);
    }
  }

  getServices() {
    return queryAll('SELECT * FROM services WHERE active = 1 ORDER BY name');
  }

  getAvailableSlots(dateStr, serviceId) {
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0) return [];
    
    const hours = dayOfWeek === 6 ? { start: 9, end: 13 } : { start: 8, end: 18 };
    const service = queryOne('SELECT duration_minutes FROM services WHERE id = ?', [serviceId]);
    const duration = service ? service.duration_minutes : 60;
    
    const blocked = queryAll('SELECT time_start, time_end FROM blocked_times WHERE date = ?', [dateStr]);
    const appointments = queryAll("SELECT time, duration_minutes FROM appointments WHERE date = ? AND status != 'cancelled'", [dateStr]);
    
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
    return slots;
  }

  formatTime12(time24) {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  isStopWord(text) {
    const normalized = text.toLowerCase().trim();
    return STOP_WORDS.some(word => normalized === word || normalized.includes(word));
  }

  async handleIncoming({ phone, name, text, isGroup }) {
    if (isGroup) return;
    
    const ycloud = require('../services/ycloud');
    const conv = this.getConversationState(phone);
    const msg = text.toLowerCase().trim();

    if (this.isStopWord(text)) {
      this.resetConversation(phone);
      await ycloud.sendText(phone, `Entendido, ${name}. No volveremos a escribirle. Si en el futuro necesita nuestros servicios, puede contactarnos cuando quiera. ¡Éxitos! 🤝`);
      this.saveHistory(phone, 'user', text);
      this.saveHistory(phone, 'assistant', `Opt-out confirmado.`);
      return;
    }

    if (msg === 'agendar' || msg === 'agendar cita' || msg === 'cita') {
      return this.startBooking(phone, name, ycloud);
    }

    if (msg === 'menu' || msg === 'inicio') {
      this.resetConversation(phone);
    }

    if (conv.state !== BOOKING_STATES.IDLE) {
      return this.handleBookingFlow(phone, name, text, conv, ycloud);
    }

    const history = this.getHistory(phone);
    history.push({ role: 'user', content: text });
    this.saveHistory(phone, 'user', text);

    const aiResponse = await this.groq.chat(history, name);
    this.saveHistory(phone, 'assistant', aiResponse);
    await ycloud.sendText(phone, aiResponse);
    logger.info(`💬 ${name} (${phone}): "${text}" → "${aiResponse.substring(0, 60)}..."`);
  }

  async startBooking(phone, name, ycloud) {
    const services = this.getServices();
    let msg = '📋 *Seleccione el servicio que desea agendar:*\n\n';
    services.forEach((svc, idx) => {
      msg += `${idx + 1}️⃣ *${svc.name}*\n   _${svc.description}_ (${svc.duration_minutes} min)\n\n`;
    });
    msg += 'Escriba el número del servicio:';
    
    await ycloud.sendText(phone, msg);
    this.setConversationState(phone, BOOKING_STATES.BOOKING_SERVICE, { services });
  }

  async handleBookingFlow(phone, name, text, conv, ycloud) {
    const msg = text.toLowerCase().trim();
    
    if (msg === 'cancelar' || msg === 'salir') {
      this.resetConversation(phone);
      await ycloud.sendText(phone, '❌ Proceso cancelado. ¿En qué puedo ayudarle?');
      return;
    }

    switch (conv.state) {
      case BOOKING_STATES.BOOKING_SERVICE:
        return this.handleServiceSelection(phone, name, text, conv, ycloud);
      case BOOKING_STATES.BOOKING_DATE:
        return this.handleDateSelection(phone, name, text, conv, ycloud);
      case BOOKING_STATES.BOOKING_TIME:
        return this.handleTimeSelection(phone, name, text, conv, ycloud);
      case BOOKING_STATES.BOOKING_CONFIRM:
        return this.handleConfirmation(phone, name, text, conv, ycloud);
      default:
        this.resetConversation(phone);
    }
  }

  async handleServiceSelection(phone, name, text, conv, ycloud) {
    const services = conv.context.services || this.getServices();
    const idx = parseInt(text) - 1;

    if (isNaN(idx) || idx < 0 || idx >= services.length) {
      await ycloud.sendText(phone, 'Opción no válida. Por favor elija un número:');
      return;
    }

    const selectedService = services[idx];
    const today = new Date();
    let dateOptions = '';
    
    for (let i = 1; i <= 7; i++) {
      const date = addDays(today, i);
      const dayName = format(date, 'EEEE');
      const dateStr = format(date, 'yyyy-MM-dd');
      const dateDisplay = format(date, 'dd/MM/yyyy');
      const slots = this.getAvailableSlots(dateStr, selectedService.id);
      
      if (slots.length > 0) {
        const dayNameEs = this.translateDay(dayName);
        dateOptions += `${i}️⃣ *${dayNameEs} ${dateDisplay}* (${slots.length} horarios)\n`;
      }
    }

    if (!dateOptions) {
      await ycloud.sendText(phone, 'Lo siento, no hay disponibilidad en los próximos 7 días.');
      this.resetConversation(phone);
      return;
    }

    await ycloud.sendText(phone, `📅 *Seleccione la fecha para ${selectedService.name}:*\n\n${dateOptions}\nEscriba el número de la fecha:`);
    this.setConversationState(phone, BOOKING_STATES.BOOKING_DATE, { service: selectedService });
  }

  async handleDateSelection(phone, name, text, conv, ycloud) {
    const option = parseInt(text);
    if (isNaN(option) || option < 1 || option > 7) {
      await ycloud.sendText(phone, 'Opción no válida. Elija un número del 1 al 7:');
      return;
    }

    const today = new Date();
    const selectedDate = addDays(today, option);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayName = this.translateDay(format(selectedDate, 'EEEE'));
    const dateDisplay = format(selectedDate, 'dd/MM/yyyy');
    
    const slots = this.getAvailableSlots(dateStr, conv.context.service.id);
    
    if (slots.length === 0) {
      await ycloud.sendText(phone, 'No hay horarios disponibles para esa fecha. Elija otra:');
      return;
    }

    let timeOptions = '';
    slots.forEach((slot, idx) => {
      timeOptions += `${idx + 1}️⃣ ${this.formatTime12(slot.start)}\n`;
    });

    await ycloud.sendText(phone, `⏰ *Horarios disponibles para ${dayName} ${dateDisplay}:*\n\n${timeOptions}\nEscriba el número del horario:`);
    this.setConversationState(phone, BOOKING_STATES.BOOKING_TIME, { service: conv.context.service, date: dateStr, dateDisplay, dayName, slots });
  }

  async handleTimeSelection(phone, name, text, conv, ycloud) {
    const option = parseInt(text);
    const slots = conv.context.slots || [];

    if (isNaN(option) || option < 1 || option > slots.length) {
      await ycloud.sendText(phone, 'Opción no válida. Elija un número válido:');
      return;
    }

    const selectedSlot = slots[option - 1];
    const timeDisplay = this.formatTime12(selectedSlot.start);

    const confirmMsg = `📝 *Resumen de su cita:*\n\n` +
      `👤 *Cliente:* ${name}\n` +
      `💼 *Servicio:* ${conv.context.service.name}\n` +
      `📅 *Fecha:* ${conv.context.dayName} ${conv.context.dateDisplay}\n` +
      `⏰ *Hora:* ${timeDisplay}\n` +
      `⏱️ *Duración:* ${conv.context.service.duration_minutes} minutos\n\n` +
      `¿Confirma esta cita?\n\n1️⃣ *Sí, confirmar*\n2️⃣ *No, cancelar*`;

    await ycloud.sendText(phone, confirmMsg);
    this.setConversationState(phone, BOOKING_STATES.BOOKING_CONFIRM, { ...conv.context, time: selectedSlot.start, timeDisplay });
  }

  async handleConfirmation(phone, name, text, conv, ycloud) {
    if (text === '1' || text.includes('si') || text.includes('sí') || text.includes('confirmar')) {
      const client = queryOne('SELECT id FROM clients WHERE phone = ?', [phone]);
      let clientId = client ? client.id : null;
      
      if (!clientId) {
        const result = runSql('INSERT INTO clients (phone, name) VALUES (?, ?)', [phone, name]);
        clientId = result.lastId;
      }

      const service = queryOne('SELECT duration_minutes FROM services WHERE name = ?', [conv.context.service.name]);
      const duration = service ? service.duration_minutes : 60;

      const result = runSql(
        'INSERT INTO appointments (client_id, service, date, time, duration_minutes, status) VALUES (?, ?, ?, ?, ?, ?)',
        [clientId, conv.context.service.name, conv.context.date, conv.context.time, duration, 'confirmed']
      );

      const timeDisplay = this.formatTime12(conv.context.time);
      await ycloud.sendText(phone, 
        `✅ *¡Cita confirmada!*\n\n` +
        `📄 Número de cita: *#${result.lastId}*\n` +
        `💼 Servicio: ${conv.context.service.name}\n` +
        `📅 Fecha: ${conv.context.dayName} ${conv.context.dateDisplay}\n` +
        `⏰ Hora: ${timeDisplay}\n\n` +
        `📍 *Lopez Tech* - Santa Marta, Colombia\n\n` +
        `Le enviaremos un recordatorio antes de su cita. ¡Nos vemos! 👋`
      );

      this.resetConversation(phone);
    } else if (text === '2' || text.includes('no') || text.includes('cancelar')) {
      await ycloud.sendText(phone, '❌ Cita cancelada. ¿Desea agendar otra? Escriba *"agendar"*');
      this.resetConversation(phone);
    } else {
      await ycloud.sendText(phone, 'Por favor responda *1* para confirmar o *2* para cancelar:');
    }
  }

  translateDay(day) {
    const days = { 'Monday': 'Lunes', 'Tuesday': 'Martes', 'Wednesday': 'Miércoles', 'Thursday': 'Jueves', 'Friday': 'Viernes', 'Saturday': 'Sábado', 'Sunday': 'Domingo' };
    return days[day] || day;
  }
}

module.exports = new MessageHandler();
