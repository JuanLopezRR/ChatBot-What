const axios = require('axios');
const { queryAll, queryOne, runSql } = require('../database/init');
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
6) Si quiere agendar cita, dile que puede escribir "agendar" para comenzar el proceso.
7) Si no sabes algo, di que lo consultas con el equipo.
8) Si preguntan por servicios, describe brevemente los que ofrece la empresa.
9) Si es fuera de horario, responde igual pero menciona que el equipo le responderá en horario laboral.`;

const STOP_WORDS = ['parar', 'cancelar', 'salir', 'stop', 'no quiero mensajes', 'cancela', 'cancel', 'detener', 'no mas', 'no más'];

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

  getHistory(phone) {
    return queryAll(
      "SELECT role, content FROM chat_history WHERE phone = ? ORDER BY id ASC",
      [phone]
    ).slice(-20);
  }

  saveHistory(phone, role, content) {
    runSql(
      "INSERT INTO chat_history (phone, role, content) VALUES (?, ?, ?)",
      [phone, role, content]
    );
    const count = queryOne(
      "SELECT COUNT(*) as count FROM chat_history WHERE phone = ?",
      [phone]
    );
    if (count.count > 50) {
      runSql(
        "DELETE FROM chat_history WHERE phone = ? AND id NOT IN (SELECT id FROM chat_history WHERE phone = ? ORDER BY id DESC LIMIT 30)",
        [phone, phone]
      );
    }
  }

  isInBusinessHours() {
    const now = new Date();
    const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const hour = colombiaTime.getHours();
    const day = colombiaTime.getDay();
    
    if (day === 0) return false;
    if (day === 6) return hour >= 9 && hour < 13;
    return hour >= 8 && hour < 18;
  }

  isStopWord(text) {
    const normalized = text.toLowerCase().trim();
    return STOP_WORDS.some(word => normalized === word || normalized.includes(word));
  }

  async handleIncoming({ phone, name, text, isGroup }) {
    if (isGroup) return;
    
    const ycloud = require('../services/ycloud');

    if (this.isStopWord(text)) {
      await ycloud.sendText(phone, `Entendido, ${name}. No volveremos a escribirle. Si en el futuro necesita nuestros servicios, puede contactarnos cuando quiera. ¡Éxitos! 🤝`);
      this.saveHistory(phone, 'user', text);
      this.saveHistory(phone, 'assistant', `Opt-out confirmado.`);
      return;
    }

    const history = this.getHistory(phone);
    history.push({ role: 'user', content: text });

    this.saveHistory(phone, 'user', text);

    const aiResponse = await this.groq.chat(history, name);

    this.saveHistory(phone, 'assistant', aiResponse);

    await ycloud.sendText(phone, aiResponse);

    logger.info(`💬 ${name} (${phone}): "${text}" → "${aiResponse.substring(0, 60)}..."`);
  }
}

module.exports = new MessageHandler();
