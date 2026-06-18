const conversation = require('../services/conversation');
const appointments = require('../services/appointments');
const clients = require('../services/clients');
const serviceCatalog = require('../services/services');
const ycloud = require('../services/ycloud');
const { format, addDays, isWeekend } = require('date-fns');
const { es } = require('date-fns/locale');
const { logger } = require('../utils/logger');

const STATES = conversation.STATES;

const BUSINESS_INFO = {
  name: 'Lopez Tech',
  location: 'Santa Marta, Colombia',
  schedule: {
    weekday: 'Lunes a Viernes: 8:00 AM - 6:00 PM',
    saturday: 'Sábados: 9:00 AM - 1:00 PM',
    sunday: 'Domingos: Cerrado'
  },
  phone: '+57 XXX XXX XXXX',
  services: [
    'Reparación de Computadores',
    'Soporte de Impresoras',
    'Desarrollo Web',
    'Software POS',
    'Soporte Técnico General',
    'Soluciones Tecnológicas',
    'Mantenimiento Preventivo',
    'Recuperación de Datos'
  ]
};

class MessageHandler {
  async handleIncoming(messageData) {
    const { phone, name, text, isGroup } = messageData;

    if (isGroup) return;

    try {
      const client = clients.getOrCreateClient(phone, name);
      const conv = conversation.getConversation(phone);

      logger.info(`Mensaje de ${name} (${phone}): "${text}" | Estado: ${conv.state}`);

      await this.processMessage(phone, name, text.toLowerCase().trim(), conv);
    } catch (error) {
      logger.error(`Error procesando mensaje de ${phone}: ${error.message}`);
      await ycloud.sendText(phone, 'Disculpa, tuve un problema técnico. Por favor intenta de nuevo. 🔄');
    }
  }

  async processMessage(phone, name, text, conv) {
    switch (conv.state) {
      case STATES.IDLE:
        return this.handleIdle(phone, name, text);
      case STATES.MAIN_MENU:
        return this.handleMainMenu(phone, name, text);
      case STATES.BOOKING_SERVICE:
        return this.handleBookingService(phone, name, text, conv.context);
      case STATES.BOOKING_DATE:
        return this.handleBookingDate(phone, name, text, conv.context);
      case STATES.BOOKING_TIME:
        return this.handleBookingTime(phone, name, text, conv.context);
      case STATES.BOOKING_CONFIRM:
        return this.handleBookingConfirm(phone, name, text, conv.context);
      case STATES.VIEWING_APPOINTMENTS:
        return this.handleViewingAppointments(phone, name, text);
      case STATES.CANCELLING_APPOINTMENT:
        return this.handleCancellingAppointment(phone, name, text, conv.context);
      case STATES.GETTING_INFO:
        return this.handleGettingInfo(phone, name, text);
      case STATES.PROVIDING_NAME:
        return this.handleProvidingName(phone, name, text);
      default:
        conversation.resetConversation(phone);
        return this.handleIdle(phone, name, text);
    }
  }

  async handleIdle(phone, name, text) {
    const greetings = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'hi', 'hello', 'buenas'];
    const isGreeting = greetings.some(g => text.includes(g));

    if (isGreeting || text === '1' || text === 'menu') {
      const client = clients.getClientByPhone(phone);
      const displayName = client && client.name !== 'Cliente' ? client.name : name;
      
      await ycloud.sendText(phone, `¡Hola ${displayName}! 👋 Bienvenido a *${BUSINESS_INFO.name}*.\n\n¿En qué puedo ayudarte hoy?\n\n1️⃣ *Agendar cita*\n2️⃣ *Ver mis citas*\n3️⃣ *Cancelar cita*\n4️⃣ *Nuestros servicios*\n5️⃣ *Información del negocio*\n6️⃣ *Hablar con una persona*\n\nEscribe el número de tu opción:`);
      conversation.setState(phone, STATES.MAIN_MENU);
    } else if (text.includes('cita') || text.includes('agendar') || text.includes('appointment')) {
      return this.startBooking(phone, name);
    } else if (text.includes('servicio')) {
      return this.showServices(phone);
    } else if (text.includes('info') || text.includes('horario') || text.includes('ubicacion')) {
      return this.showBusinessInfo(phone);
    } else {
      await ycloud.sendText(phone, `¡Hola ${name}! 👋 Soy el asistente virtual de *${BUSINESS_INFO.name}*.\n\nEscribe *"hola"* o *"menu"* para ver las opciones disponibles.`);
    }
  }

  async handleMainMenu(phone, name, text) {
    switch (text) {
      case '1':
      case 'agendar':
      case 'agendar cita':
        return this.startBooking(phone, name);
      case '2':
      case 'ver':
      case 'ver citas':
        return this.showAppointments(phone);
      case '3':
      case 'cancelar':
      case 'cancelar cita':
        return this.startCancellation(phone);
      case '4':
      case 'servicios':
        return this.showServices(phone);
      case '5':
      case 'info':
      case 'informacion':
        return this.showBusinessInfo(phone);
      case '6':
      case 'persona':
      case 'agente':
        await ycloud.sendText(phone, 'Un momento por favor, te comunico con un asesor humano. 👨‍💼\n\nEnhorabuena Lopez Tech: +57 XXX XXX XXXX');
        conversation.resetConversation(phone);
        return;
      default:
        await ycloud.sendText(phone, 'No entendí tu opción. Por favor elige un número del 1 al 6:');
    }
  }

  async startBooking(phone, name) {
    const services = serviceCatalog.getAll();
    let msg = '📋 *Selecciona el servicio que deseas agendar:*\n\n';
    services.forEach((svc, idx) => {
      msg += `${idx + 1}️⃣ *${svc.name}*\n   _${svc.description}_ (${svc.duration_minutes} min)\n\n`;
    });
    msg += 'Escribe el número del servicio:';
    
    await ycloud.sendText(phone, msg);
    conversation.setState(phone, STATES.BOOKING_SERVICE, { services });
  }

  async handleBookingService(phone, name, text, context) {
    const services = context.services || serviceCatalog.getAll();
    const idx = parseInt(text) - 1;

    if (isNaN(idx) || idx < 0 || idx >= services.length) {
      await ycloud.sendText(phone, 'Opción no válida. Por favor elige un número:');
      return;
    }

    const selectedService = services[idx];
    const today = new Date();
    let dateOptions = '';
    
    for (let i = 1; i <= 7; i++) {
      const date = addDays(today, i);
      const dayName = format(date, 'EEEE', { locale: es });
      const dateStr = format(date, 'yyyy-MM-dd');
      const dateDisplay = format(date, 'dd/MM/yyyy');
      const slots = appointments.getAvailableSlots(dateStr, selectedService.id);
      
      if (slots.length > 0) {
        dateOptions += `${i}️⃣ *${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dateDisplay}* (${slots.length} horarios disponibles)\n`;
      }
    }

    if (!dateOptions) {
      await ycloud.sendText(phone, 'Lo siento, no hay disponibilidad en los próximos 7 días. Intenta más tarde o contacta directamente.');
      conversation.resetConversation(phone);
      return;
    }

    await ycloud.sendText(phone, `📅 *Selecciona la fecha para ${selectedService.name}:*\n\n${dateOptions}\nEscribe el número de la fecha:`);
    conversation.setState(phone, STATES.BOOKING_DATE, { service: selectedService });
  }

  async handleBookingDate(phone, name, text, context) {
    const option = parseInt(text);
    if (isNaN(option) || option < 1 || option > 7) {
      await ycloud.sendText(phone, 'Opción no válida. Por favor elige un número del 1 al 7:');
      return;
    }

    const today = new Date();
    const selectedDate = addDays(today, option);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayName = format(selectedDate, 'EEEE', { locale: es });
    const dateDisplay = format(selectedDate, 'dd/MM/yyyy');
    
    const slots = appointments.getAvailableSlots(dateStr, context.service.id);
    
    if (slots.length === 0) {
      await ycloud.sendText(phone, 'No hay horarios disponibles para esa fecha. Elige otra fecha:');
      return;
    }

    let timeOptions = '';
    slots.forEach((slot, idx) => {
      const timeDisplay = appointments.formatTime12(slot.start);
      timeOptions += `${idx + 1}️⃣ ${timeDisplay}\n`;
    });

    await ycloud.sendText(phone, `⏰ *Horarios disponibles para ${dayName} ${dateDisplay}:*\n\n${timeOptions}\nEscribe el número del horario:`);
    conversation.setState(phone, STATES.BOOKING_TIME, { 
      service: context.service, 
      date: dateStr, 
      dateDisplay,
      dayName,
      slots 
    });
  }

  async handleBookingTime(phone, name, text, context) {
    const option = parseInt(text);
    const slots = context.slots || [];

    if (isNaN(option) || option < 1 || option > slots.length) {
      await ycloud.sendText(phone, 'Opción no válida. Por favor elige un número válido:');
      return;
    }

    const selectedSlot = slots[option - 1];
    const timeDisplay = appointments.formatTime12(selectedSlot.start);

    const client = clients.getClientByPhone(phone);
    const needsName = !client || client.name === 'Cliente';

    let confirmMsg = `📝 *Resumen de tu cita:*\n\n`;
    confirmMsg += `👤 *Cliente:* ${needsName ? '(por confirmar)' : client.name}\n`;
    confirmMsg += `💼 *Servicio:* ${context.service.name}\n`;
    confirmMsg += `📅 *Fecha:* ${context.dayName.charAt(0).toUpperCase() + context.dayName.slice(1)} ${context.dateDisplay}\n`;
    confirmMsg += `⏰ *Hora:* ${timeDisplay}\n`;
    confirmMsg += `⏱️ *Duración:* ${context.service.duration_minutes} minutos\n\n`;
    
    if (needsName) {
      confirmMsg += '¿Cómo te llamas? (nombre completo):';
      await ycloud.sendText(phone, confirmMsg);
      conversation.setState(phone, STATES.PROVIDING_NAME, {
        ...context,
        time: selectedSlot.start,
        timeDisplay
      });
    } else {
      confirmMsg += '¿Confirmas esta cita?\n\n1️⃣ *Sí, confirmar*\n2️⃣ *No, cancelar*';
      await ycloud.sendText(phone, confirmMsg);
      conversation.setState(phone, STATES.BOOKING_CONFIRM, {
        ...context,
        time: selectedSlot.start,
        timeDisplay
      });
    }
  }

  async handleProvidingName(phone, name, text, context) {
    if (text.length < 3 || text.length > 50) {
      await ycloud.sendText(phone, 'Por favor ingresa un nombre válido (3-50 caracteres):');
      return;
    }

    const clientName = text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    clients.updateClient(phone, { name: clientName });

    let confirmMsg = `📝 *Resumen de tu cita:*\n\n`;
    confirmMsg += `👤 *Cliente:* ${clientName}\n`;
    confirmMsg += `💼 *Servicio:* ${context.service.name}\n`;
    confirmMsg += `📅 *Fecha:* ${context.dayName.charAt(0).toUpperCase() + context.dayName.slice(1)} ${context.dateDisplay}\n`;
    confirmMsg += `⏰ *Hora:* ${context.timeDisplay}\n`;
    confirmMsg += `⏱️ *Duración:* ${context.service.duration_minutes} minutos\n\n`;
    confirmMsg += '¿Confirmas esta cita?\n\n1️⃣ *Sí, confirmar*\n2️⃣ *No, cancelar*';

    await ycloud.sendText(phone, confirmMsg);
    conversation.setState(phone, STATES.BOOKING_CONFIRM, { ...context, clientName });
  }

  async handleBookingConfirm(phone, name, text, context) {
    if (text === '1' || text.includes('si') || text.includes('sí') || text.includes('confirmar')) {
      const client = clients.getOrCreateClient(phone, context.clientName || name);
      
      const appointmentId = appointments.createAppointment(
        client.id,
        context.service.id,
        context.date,
        context.time,
        `Cita agendada vía WhatsApp`,
        null
      );

      appointments.confirmAppointment(appointmentId);

      const timeDisplay = appointments.formatTime12(context.time);
      await ycloud.sendText(phone, 
        `✅ *¡Cita confirmada!*\n\n` +
        `📄 Número de cita: *#${appointmentId}*\n` +
        `💼 Servicio: ${context.service.name}\n` +
        `📅 Fecha: ${context.dayName.charAt(0).toUpperCase() + context.dayName.slice(1)} ${context.dateDisplay}\n` +
        `⏰ Hora: ${timeDisplay}\n\n` +
        `📍 *${BUSINESS_INFO.name}* - ${BUSINESS_INFO.location}\n\n` +
        `Te enviaremos un recordatorio antes de tu cita. ¡Nos vemos! 👋`
      );

      conversation.resetConversation(phone);
    } else if (text === '2' || text.includes('no') || text.includes('cancelar')) {
      await ycloud.sendText(phone, '❌ Cita cancelada. ¿Deseas agendar otra?\n\nEscribe *"agendar"* para comenzar de nuevo o *"menu"* para ver opciones.');
      conversation.resetConversation(phone);
    } else {
      await ycloud.sendText(phone, 'Por favor responde *1* para confirmar o *2* para cancelar:');
    }
  }

  async showAppointments(phone) {
    const client = clients.getClientByPhone(phone);
    if (!client) {
      await ycloud.sendText(phone, 'No tienes citas registradas. ¿Deseas agendar una?\n\nEscribe *"agendar"* para comenzar.');
      conversation.resetConversation(phone);
      return;
    }

    const upcoming = appointments.getClientAppointments(client.id, true);
    
    if (upcoming.length === 0) {
      await ycloud.sendText(phone, '📅 No tienes citas próximas programadas.\n\n¿Deseas agendar una? Escribe *"agendar"*');
      conversation.resetConversation(phone);
      return;
    }

    let msg = '📅 *Tus próximas citas:*\n\n';
    upcoming.forEach(apt => {
      const timeDisplay = appointments.formatTime12(apt.time.substring(0, 5));
      const statusEmoji = apt.status === 'confirmed' ? '✅' : '⏳';
      const dateDisplay = format(new Date(apt.date + 'T12:00:00'), 'dd/MM/yyyy');
      msg += `${statusEmoji} *Cita #${apt.id}*\n`;
      msg += `   📋 ${apt.service}\n`;
      msg += `   📅 ${dateDisplay} - ⏰ ${timeDisplay}\n`;
      msg += `   📌 Estado: ${apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}\n\n`;
    });

    msg += 'Escribe *"agendar"* para nueva cita o *"cancelar"* para cancelar una.';
    
    await ycloud.sendText(phone, msg);
    conversation.resetConversation(phone);
  }

  async startCancellation(phone) {
    const client = clients.getClientByPhone(phone);
    if (!client) {
      await ycloud.sendText(phone, 'No tienes citas registradas.');
      conversation.resetConversation(phone);
      return;
    }

    const upcoming = appointments.getClientAppointments(client.id, true);
    
    if (upcoming.length === 0) {
      await ycloud.sendText(phone, '📅 No tienes citas para cancelar.');
      conversation.resetConversation(phone);
      return;
    }

    let msg = '❌ *Selecciona la cita que deseas cancelar:*\n\n';
    upcoming.forEach((apt, idx) => {
      const timeDisplay = appointments.formatTime12(apt.time.substring(0, 5));
      const dateDisplay = format(new Date(apt.date + 'T12:00:00'), 'dd/MM/yyyy');
      msg += `${idx + 1}️⃣ *#${apt.id}* - ${apt.service}\n   📅 ${dateDisplay} - ⏰ ${timeDisplay}\n\n`;
    });
    msg += '0️⃣ *Volver al menú*\n\nEscribe el número:';
    
    await ycloud.sendText(phone, msg);
    conversation.setState(phone, STATES.CANCELLING_APPOINTMENT, { appointments: upcoming });
  }

  async handleCancellingAppointment(phone, name, text, context) {
    if (text === '0' || text.includes('volver')) {
      await ycloud.sendText(phone, '🏠 *Menú principal*\n\n1️⃣ Agendar cita\n2️⃣ Ver mis citas\n3️⃣ Cancelar cita\n4️⃣ Servicios\n5️⃣ Información\n6️⃣ Hablar con persona');
      conversation.setState(phone, STATES.MAIN_MENU);
      return;
    }

    const option = parseInt(text);
    const apts = context.appointments || [];

    if (isNaN(option) || option < 1 || option > apts.length) {
      await ycloud.sendText(phone, 'Opción no válida. Elige un número:');
      return;
    }

    const apt = apts[option - 1];
    appointments.cancelAppointment(apt.id);

    await ycloud.sendText(phone, `✅ *Cita #${apt.id} cancelada correctamente.*\n\n¿Deseas agendar una nueva cita?\n\nEscribe *"agendar"* o *"menu"*`);
    conversation.resetConversation(phone);
  }

  async showServices(phone) {
    const services = serviceCatalog.getAll();
    let msg = '🔧 *Nuestros Servicios:*\n\n';
    
    services.forEach((svc, idx) => {
      msg += `*${idx + 1}. ${svc.name}*\n`;
      msg += `   📝 ${svc.description}\n`;
      msg += `   ⏱️ Duración: ${svc.duration_minutes} minutos\n\n`;
    });

    msg += '¿Deseas agendar alguno? Escribe *"agendar"*';
    
    await ycloud.sendText(phone, msg);
    conversation.resetConversation(phone);
  }

  async showBusinessInfo(phone) {
    const info = `🏢 *${BUSINESS_INFO.name}*\n\n` +
      `📍 *Ubicación:* ${BUSINESS_INFO.location}\n\n` +
      `🕐 *Horario de atención:*\n` +
      `   📅 ${BUSINESS_INFO.schedule.weekday}\n` +
      `   📅 ${BUSINESS_INFO.schedule.saturday}\n` +
      `   📅 ${BUSINESS_INFO.schedule.sunday}\n\n` +
      `📞 *Contacto:* ${BUSINESS_INFO.phone}\n\n` +
      `💻 *Servicios:*\n${BUSINESS_INFO.services.map(s => `   • ${s}`).join('\n')}\n\n` +
      `¿En qué puedo ayudarte?`;
    
    await ycloud.sendText(phone, info);
    conversation.resetConversation(phone);
  }

  async handleGettingInfo(phone, name, text) {
    await this.showBusinessInfo(phone);
  }
}

module.exports = new MessageHandler();
