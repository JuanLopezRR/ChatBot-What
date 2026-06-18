const axios = require('axios');
const { queryAll, queryOne, runSql, isBotPaused, getSetting, setSetting } = require('../database/init');
const { format, addDays } = require('date-fns');
const { logger } = require('../utils/logger');

const ADMIN_PHONE = (process.env.ADMIN_PHONE || '').replace(/[^0-9]/g, '');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Eres Andres, asesor comercial de Lopez Tech en Santa Marta, Colombia. Eres una persona REAL, NUNCA eres una IA o chatbot.

EMPRESA: Lopez Tech - Soluciones tecnológicas en Santa Marta, Colombia.
SERVICIOS: Reparación de computadores, impresoras, páginas web, software POS, soporte técnico, soluciones tecnológicas.
HORARIO: Lunes a viernes 8am-6pm, sábados 9am-1pm.
LINK DE AGENDAMIENTO: https://lopezt-production.up.railway.app/

REGLAS ESTRICTAS:
- NUNCA des la misma respuesta dos veces seguidas
- NUNCA saludes si ya hay mensajes anteriores en la conversación
- NUNCA empieces con "Hola" si el cliente ya habló antes
- Respuestas de 2-4 líneas máximo, sé directo y natural
- USA USTED, nunca uses jerga (parcero, chevere, etc.)
- Si te dan datos de una cita, responde CON ESA INFORMACIÓN, no pidas que la repitan
- Si el cliente pregunta por su cita, da los datos que tienes
- Sé conversacional como una persona real por WhatsApp
- Si no entiendes algo, di "Disculpe, ¿podría repetirlo?"
- Si preguntan por precios, di que depende del proyecto y ofrece cotización
- Si quieren agendar, envía el link o ofrece guiarlos por chat`;

const STOP_WORDS = ['parar', 'cancelar', 'salir', 'stop', 'no quiero mensajes', 'cancela', 'cancel', 'detener', 'no mas', 'no más'];

const BOOKING_STATES = {
  IDLE: 'idle',
  BOOKING_SERVICE: 'booking_service',
  BOOKING_DATE: 'booking_date',
  BOOKING_TIME: 'booking_time',
  BOOKING_CONFIRM: 'booking_confirm'
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

  async chat(messages, userName, contextExtra = '') {
    try {
      const recentMessages = messages.slice(-10);
      const historyText = recentMessages.map(m => 
        `${m.role === 'user' ? userName : 'Andres'}: ${m.content}`
      ).join('\n');

      const systemMessage = SYSTEM_PROMPT + 
        '\n\nHISTORIAL DE LA CONVERSACIÓN (más reciente al final):\n' + 
        (historyText || 'Primera vez que habla con el cliente.') +
        contextExtra;

      const response = await this.client.post('', {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          ...recentMessages.map(m => ({ role: m.role, content: m.content }))
        ],
        max_tokens: 120,
        temperature: 0.6,
        top_p: 0.9
      });

      return response.data.choices?.[0]?.message?.content || '';
    } catch (error) {
      logger.error(`Error en Groq API: ${error.message}`);
      return '';
    }
  }
}

class MessageHandler {
  constructor() {
    this.groq = new GroqService();
  }

  async getConversationState(phone) {
    let conv = await queryOne('SELECT * FROM conversations WHERE phone = $1', [phone]);
    if (!conv) {
      await runSql('INSERT INTO conversations (phone, state, context) VALUES ($1, $2, $3)', [phone, BOOKING_STATES.IDLE, '{}']);
      conv = await queryOne('SELECT * FROM conversations WHERE phone = $1', [phone]);
    }
    return { ...conv, context: JSON.parse(conv.context || '{}') };
  }

  async setConversationState(phone, state, context = {}) {
    await runSql('UPDATE conversations SET state = $1, context = $2, last_message_at = CURRENT_TIMESTAMP WHERE phone = $3', [state, JSON.stringify(context), phone]);
  }

  async resetConversation(phone) {
    await this.setConversationState(phone, BOOKING_STATES.IDLE, {});
  }

  async getHistory(phone) {
    const history = await queryAll(
      "SELECT role, content FROM chat_history WHERE phone = $1 ORDER BY id ASC",
      [phone]
    );
    return history.slice(-20);
  }

  async saveHistory(phone, role, content) {
    await runSql("INSERT INTO chat_history (phone, role, content) VALUES ($1, $2, $3)", [phone, role, content]);
    const count = await queryOne("SELECT COUNT(*) as count FROM chat_history WHERE phone = $1", [phone]);
    if (count.count > 50) {
      await runSql("DELETE FROM chat_history WHERE id NOT IN (SELECT id FROM chat_history WHERE phone = $1 ORDER BY id DESC LIMIT 30)", [phone]);
    }
  }

  async getServices() {
    return await queryAll('SELECT * FROM services WHERE active = 1 ORDER BY name');
  }

  async getClientAppointments(phone) {
    const phoneVariants = [
      phone,
      phone.replace(/^57/, ''),
      '57' + phone.replace(/^57/, ''),
      phone.replace(/^0/, ''),
      '57' + phone.replace(/^0/, '')
    ];
    const uniquePhones = [...new Set(phoneVariants)];
    return await queryAll(`
      SELECT id, nombre, negocio, telefono, correo, plan, fecha, hora, notas, estado
      FROM citas
      WHERE telefono = ANY($1)
      ORDER BY fecha DESC
      LIMIT 5
    `, [uniquePhones]);
  }

  async getClientAppointmentsByName(name) {
    return await queryAll(`
      SELECT id, nombre, negocio, telefono, correo, plan, fecha, hora, notas, estado
      FROM citas
      WHERE nombre ILIKE $1 OR negocio ILIKE $1
      ORDER BY fecha DESC
      LIMIT 5
    `, [`%${name}%`]);
  }

  async getClientPastAppointments(phone) {
    return await queryAll(`
      SELECT id, nombre, negocio, telefono, correo, plan, fecha, hora, notas, estado
      FROM citas
      WHERE telefono = ANY($1)
      ORDER BY fecha DESC
      LIMIT 3
    `, [[phone, phone.replace(/^57/, ''), '57' + phone.replace(/^57/, '')]]);
  }

  async getAllAppointmentsForAI(phone, text) {
    let upcoming = await this.getClientAppointments(phone);
    let past = [];
    let searchedByName = false;

    if (upcoming.length === 0) {
      const nameMatch = text.match(/(?:a nombre de|nombre:?\s*)(.+?)(?:\s+|$)/i);
      if (nameMatch) {
        const searchName = nameMatch[1].trim();
        upcoming = await this.getClientAppointmentsByName(searchName);
        searchedByName = true;
      } else {
        const allClients = await queryAll('SELECT DISTINCT nombre, negocio, telefono FROM citas ORDER BY id DESC LIMIT 20');
        const nameInText = allClients.find(c => 
          text.toLowerCase().includes(c.nombre.toLowerCase()) || 
          text.toLowerCase().includes(c.negocio.toLowerCase())
        );
        if (nameInText) {
          upcoming = await this.getClientAppointments(nameInText.telefono);
          searchedByName = true;
        }
      }
    }

    return { upcoming, past, searchedByName };
  }

  formatAppointmentForAI(appointments) {
    if (!appointments || appointments.length === 0) return 'No se encontraron citas registradas para este nombre/teléfono.';
    return appointments.map(a => {
      let fechaDisplay = a.fecha;
      if (a.fecha && a.fecha.includes('-')) {
        const [year, month, day] = a.fecha.split('T')[0].split('-');
        fechaDisplay = `${day}/${month}/${year}`;
      }
      const hora = a.hora || 'Sin hora';
      const estado = a.estado || 'Sin estado';
      return `Cita #${a.id}: ${a.nombre || 'N/A'} | Negocio: ${a.negocio || 'N/A'} | Plan: ${a.plan || 'N/A'} | Fecha: ${fechaDisplay} | Hora: ${hora} | Estado: ${estado}`;
    }).join('\n');
  }

  isAskingAboutAppointment(text) {
    const keywords = [
      'mi cita', 'mis citas', 'cuando es', 'cuándo es', 'fecha de mi', 'horario de mi', 
      'estado de mi', 'consultar cita', 'ver mis citas', 'próxima cita', 'proxima cita', 
      'tengo cita', 'tengo alguna', 'agendé', 'agende', 'reservé', 'reserve', 
      'que citas', 'qué citas', 'cuales mis', 'cuáles mis', 'aprobaron', 'aprobación',
      'aprobada', 'confirmada', 'confirmar mi cita', 'a nombre de', 'nombre de',
      'cuanto falta', 'cuánto falta', 'ya es', 'es hoy', 'es mañana', 'mis datos',
      'consultar', 'verificar', 'revisar', 'info de mi', 'información de mi',
      'sobre mi cita', 'de mi cita', 'cita de', 'cuando mi', 'cuándo mi',
      'que hora', 'qué hora', 'a que hora', 'a qué hora', 'hora de mi'
    ];
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  }

  async getAvailableSlots(dateStr, serviceId) {
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0) return [];
    
    const hours = dayOfWeek === 6 ? { start: 9, end: 13 } : { start: 8, end: 18 };
    const service = await queryOne('SELECT duration_minutes FROM services WHERE id = $1', [serviceId]);
    const duration = service ? service.duration_minutes : 60;
    
    const blocked = await queryAll('SELECT time_start, time_end FROM blocked_times WHERE date = $1', [dateStr]);
    const appointments = await queryAll("SELECT time, duration_minutes FROM appointments WHERE date = $1 AND status != 'cancelled'", [dateStr]);
    
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

  translateDay(day) {
    const days = { 'Monday': 'Lunes', 'Tuesday': 'Martes', 'Wednesday': 'Miércoles', 'Thursday': 'Jueves', 'Friday': 'Viernes', 'Saturday': 'Sábado', 'Sunday': 'Domingo' };
    return days[day] || day;
  }

  isAdmin(phone) {
    const clean = phone.replace(/[^0-9]/g, '');
    return ADMIN_PHONE && clean === ADMIN_PHONE;
  }

  async handleAdminCommand(phone, name, text, ycloud) {
    const cmd = text.toLowerCase().trim();

    if (cmd === '/pausar') {
      await setSetting('paused', 'true');
      await ycloud.sendText(phone, '⏸️ *Bot pausado.* Ya no responderé automáticamente a los clientes. Usa /reanudar para activarme de nuevo.');
      return true;
    }

    if (cmd === '/reanudar') {
      await setSetting('paused', 'false');
      await ycloud.sendText(phone, '▶️ *Bot reanudado.* Ya estoy respondiendo a los clientes nuevamente.');
      return true;
    }

    if (cmd === '/estado') {
      const paused = await isBotPaused();
      const enHumanos = await queryAll("SELECT COUNT(*) as count FROM conversations WHERE human_mode = TRUE");
      const totalConv = await queryAll("SELECT COUNT(*) as count FROM conversations");
      const msg = `📊 *Estado del Bot*\n\n` +
        `⏸️ Pausado: ${paused ? 'SÍ' : 'NO'}\n` +
        `👤 Conversaciones en modo humano: ${enHumanos[0]?.count || 0}\n` +
        `💬 Total conversaciones: ${totalConv[0]?.count || 0}\n` +
        `📱 Admin: ${ADMIN_PHONE || '❌ No configurado'}`;
      await ycloud.sendText(phone, msg);
      return true;
    }

    if (cmd.startsWith('/tomar')) {
      const parts = cmd.split(' ');
      let targetPhone = parts[1];
      if (!targetPhone) {
        const ultima = await queryOne("SELECT phone FROM conversations WHERE human_mode = FALSE ORDER BY last_message_at DESC NULLS LAST LIMIT 1");
        if (ultima) targetPhone = ultima.phone;
      }
      if (targetPhone) {
        const cleanTarget = targetPhone.replace(/[^0-9]/g, '');
        await runSql('UPDATE conversations SET human_mode = TRUE WHERE phone = $1', [cleanTarget]);
        await ycloud.sendText(phone, `👤 *Modo humano activado* para ${cleanTarget}. Ya no respondo a ese cliente. Usa /liberar ${cleanTarget} para devolverme el control.`);
      } else {
        await ycloud.sendText(phone, '❌ No encontré un cliente. Usa: /tomar 573001234567');
      }
      return true;
    }

    if (cmd.startsWith('/liberar')) {
      const parts = cmd.split(' ');
      const targetPhone = parts[1];
      if (targetPhone) {
        const cleanTarget = targetPhone.replace(/[^0-9]/g, '');
        await runSql('UPDATE conversations SET human_mode = FALSE WHERE phone = $1', [cleanTarget]);
        await ycloud.sendText(phone, `🤖 *Modo automático restaurado* para ${cleanTarget}. Vuelvo a responderle.`);
      } else {
        await ycloud.sendText(phone, '❌ Especifica el teléfono: /liberar 573001234567');
      }
      return true;
    }

    if (cmd === '/help' || cmd === '/ayuda' || cmd === '/comandos') {
      await ycloud.sendText(phone,
        `📋 *Comandos del Admin*\n\n` +
        `⏸️ /pausar — Pausar el bot\n` +
        `▶️ /reanudar — Reanudar el bot\n` +
        `👤 /tomar [teléfono] — Tomar control de un cliente\n` +
        `   /tomar — Tomar el último cliente\n` +
        `🤖 /liberar [teléfono] — Devolver control al bot\n` +
        `📊 /estado — Ver estado del bot\n` +
        `❓ /ayuda — Ver esta ayuda`
      );
      return true;
    }

    return false;
  }

  isStopWord(text) {
    const normalized = text.toLowerCase().trim();
    return STOP_WORDS.some(word => normalized === word || normalized.includes(word));
  }

  async handleIncoming({ phone, name, text, isGroup }) {
    if (isGroup) return;

    const ycloud = require('../services/ycloud');
    const conv = await this.getConversationState(phone);
    const msg = text.toLowerCase().trim();

    // Si es el admin, procesar comandos
    if (this.isAdmin(phone)) {
      const handled = await this.handleAdminCommand(phone, name, text, ycloud);
      if (handled) {
        await this.saveHistory(phone, 'user', text);
        return;
      }
    }

    // Si el bot está pausado globalmente, no responder
    const botPaused = await isBotPaused();
    if (botPaused && !this.isAdmin(phone)) {
      logger.info(`⏸️ Bot pausado, ignorando mensaje de ${phone}`);
      return;
    }

    // Si la conversación está en modo humano, bot no responde
    if (conv.human_mode) {
      logger.info(`👤 Modo humano activo para ${phone}, bot no responde`);
      return;
    }

    if (this.isStopWord(text)) {
      await this.resetConversation(phone);
      await ycloud.sendText(phone, `Entendido, ${name}. No volveremos a escribirle. Si en el futuro necesita nuestros servicios, puede contactarnos cuando quiera. ¡Éxitos! 🤝`);
      await this.saveHistory(phone, 'user', text);
      await this.saveHistory(phone, 'assistant', `Opt-out confirmado.`);
      return;
    }

    if (msg === 'agendar' || msg === 'agendar cita' || msg === 'cita') {
      return this.startBooking(phone, name, ycloud);
    }

    if (conv.state !== BOOKING_STATES.IDLE) {
      return this.handleBookingFlow(phone, name, text, conv, ycloud);
    }

    const history = await this.getHistory(phone);
    history.push({ role: 'user', content: text });
    await this.saveHistory(phone, 'user', text);

    let contextExtra = '';
    if (this.isAskingAboutAppointment(text)) {
      const { upcoming, past, searchedByName } = await this.getAllAppointmentsForAI(phone, text);
      contextExtra = '\n\n=== INFORMACIÓN DE CITAS EN BASE DE DATOS ===\n';
      contextExtra += 'Telefono del cliente que escribe: ' + phone + '\n';
      if (searchedByName) {
        contextExtra += '(Se encontraron citas buscando por nombre en el mensaje)\n';
      }
      contextExtra += 'Citas encontradas:\n' + this.formatAppointmentForAI(upcoming) + '\n';
      if (past.length > 0) {
        contextExtra += 'Citas anteriores:\n' + this.formatAppointmentForAI(past) + '\n';
      }
      contextExtra += '=== FIN DE CITAS ===\n';
      contextExtra += '\nIMPORTANTE: Responde con los datos EXACTOS que ves arriba. Si hay citas, muestra nombre, negocio, plan y fecha. Si NO hay citas, di claramente que no se encontraron citas para ese nombre/teléfono.';
    }

    const aiResponse = await this.groq.chat(history, name, contextExtra);
    
    const finalResponse = aiResponse || this.getFallbackResponse(text, name);
    
    await this.saveHistory(phone, 'assistant', finalResponse);
    await ycloud.sendText(phone, finalResponse);
    logger.info(`💬 ${name} (${phone}): "${text}" → "${finalResponse.substring(0, 60)}..."`);
  }

  getFallbackResponse(text, name) {
    const lower = text.toLowerCase();
    if (lower.includes('hola') || lower.includes('buenos') || lower.includes('buenas')) {
      const hour = new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false });
      const h = parseInt(hour);
      let saludo = 'Buenas tardes';
      if (h >= 6 && h < 12) saludo = 'Buenos días';
      else if (h >= 19 || h < 6) saludo = 'Buenas noches';
      return `${saludo} ${name}, ¿en qué puedo ayudarle?`;
    }
    if (lower.includes('gracias')) return `De nada ${name}, ¿necesita algo más?`;
    return `${name}, un momento por favor, le ayudo.`;
  }

  async startBooking(phone, name, ycloud) {
    const services = await this.getServices();
    let msg = '📋 *Seleccione el servicio que desea agendar:*\n\n';
    services.forEach((svc, idx) => {
      msg += `${idx + 1}️⃣ *${svc.name}*\n   _${svc.description}_ (${svc.duration_minutes} min)\n\n`;
    });
    msg += 'Escriba el número del servicio:';
    
    await ycloud.sendText(phone, msg);
    await this.setConversationState(phone, BOOKING_STATES.BOOKING_SERVICE, { services });
  }

  async handleBookingFlow(phone, name, text, conv, ycloud) {
    const msg = text.toLowerCase().trim();
    
    if (msg === 'cancelar' || msg === 'salir') {
      await this.resetConversation(phone);
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
        await this.resetConversation(phone);
    }
  }

  async handleServiceSelection(phone, name, text, conv, ycloud) {
    const services = conv.context.services || await this.getServices();
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
      const dayName = this.translateDay(format(date, 'EEEE'));
      const dateStr = format(date, 'yyyy-MM-dd');
      const dateDisplay = format(date, 'dd/MM/yyyy');
      const slots = await this.getAvailableSlots(dateStr, selectedService.id);
      
      if (slots.length > 0) {
        dateOptions += `${i}️⃣ *${dayName} ${dateDisplay}* (${slots.length} horarios)\n`;
      }
    }

    if (!dateOptions) {
      await ycloud.sendText(phone, 'Lo siento, no hay disponibilidad en los próximos 7 días.');
      await this.resetConversation(phone);
      return;
    }

    await ycloud.sendText(phone, `📅 *Seleccione la fecha para ${selectedService.name}:*\n\n${dateOptions}\nEscriba el número de la fecha:`);
    await this.setConversationState(phone, BOOKING_STATES.BOOKING_DATE, { service: selectedService });
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
    
    const slots = await this.getAvailableSlots(dateStr, conv.context.service.id);
    
    if (slots.length === 0) {
      await ycloud.sendText(phone, 'No hay horarios disponibles para esa fecha. Elija otra:');
      return;
    }

    let timeOptions = '';
    slots.forEach((slot, idx) => {
      timeOptions += `${idx + 1}️⃣ ${this.formatTime12(slot.start)}\n`;
    });

    await ycloud.sendText(phone, `⏰ *Horarios disponibles para ${dayName} ${dateDisplay}:*\n\n${timeOptions}\nEscriba el número del horario:`);
    await this.setConversationState(phone, BOOKING_STATES.BOOKING_TIME, { service: conv.context.service, date: dateStr, dateDisplay, dayName, slots });
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
    await this.setConversationState(phone, BOOKING_STATES.BOOKING_CONFIRM, { ...conv.context, time: selectedSlot.start, timeDisplay });
  }

  async handleConfirmation(phone, name, text, conv, ycloud) {
    if (text === '1' || text.includes('si') || text.includes('sí') || text.includes('confirmar')) {
      let client = await queryOne('SELECT id FROM clients WHERE phone = $1', [phone]);
      
      if (!client) {
        const result = await runSql('INSERT INTO clients (phone, name) VALUES ($1, $2) RETURNING id', [phone, name]);
        client = { id: result.lastId };
      }

      const service = await queryOne('SELECT duration_minutes FROM services WHERE name = $1', [conv.context.service.name]);
      const duration = service ? service.duration_minutes : 60;

      const result = await runSql(
        'INSERT INTO appointments (client_id, service, date, time, duration_minutes, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [client.id, conv.context.service.name, conv.context.date, conv.context.time, duration, 'confirmed']
      );

      const timeDisplay = this.formatTime12(conv.context.time);
      await ycloud.sendText(phone, 
        `✅ *¡Cita confirmada!*\n\n` +
        `📄 Número de cita: *#${result.lastId}*\n` +
        `💼 Servicio: ${conv.context.service.name}\n` +
        `📅 Fecha: ${conv.context.dayName} ${conv.context.dateDisplay}\n` +
        `⏰ Hora: ${timeDisplay}\n\n` +
        `📍 *Lopez Tech* - Santa Marta, Colombia\n\n` +
        `Le enviaremos un recordatorio. ¡Nos vemos! 👋`
      );

      await this.resetConversation(phone);
    } else if (text === '2' || text.includes('no') || text.includes('cancelar')) {
      await ycloud.sendText(phone, '❌ Cita cancelada. ¿Desea agendar otra? Escriba *"agendar"*');
      await this.resetConversation(phone);
    } else {
      await ycloud.sendText(phone, 'Por favor responda *1* para confirmar o *2* para cancelar:');
    }
  }
}

module.exports = new MessageHandler();
