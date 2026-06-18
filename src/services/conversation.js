const { queryAll, queryOne, runSql } = require('../database/init');
const { logger } = require('../utils/logger');

class ConversationService {
  constructor() {
    this.STATES = {
      IDLE: 'idle',
      MAIN_MENU: 'main_menu',
      BOOKING_SERVICE: 'booking_service',
      BOOKING_DATE: 'booking_date',
      BOOKING_TIME: 'booking_time',
      BOOKING_CONFIRM: 'booking_confirm',
      BOOKING_CANCEL: 'booking_cancel',
      VIEWING_APPOINTMENTS: 'viewing_appointments',
      CANCELLING_APPOINTMENT: 'cancelling_appointment',
      GETTING_INFO: 'getting_info',
      PROVIDING_NAME: 'providing_name'
    };
  }

  getConversation(phone) {
    let conv = queryOne('SELECT * FROM conversations WHERE phone = ?', [phone]);
    
    if (!conv) {
      runSql('INSERT INTO conversations (phone, state) VALUES (?, ?)', [phone, this.STATES.IDLE]);
      conv = queryOne('SELECT * FROM conversations WHERE phone = ?', [phone]);
    }
    
    return {
      ...conv,
      context: JSON.parse(conv.context || '{}')
    };
  }

  setState(phone, state, context = {}) {
    runSql(`
      UPDATE conversations 
      SET state = ?, context = ?, last_message_at = datetime('now') 
      WHERE phone = ?
    `, [state, JSON.stringify(context), phone]);
    
    logger.debug(`Conversación ${phone}: estado -> ${state}`);
  }

  resetConversation(phone) {
    this.setState(phone, this.STATES.IDLE, {});
  }

  updateContext(phone, newContext) {
    const conv = this.getConversation(phone);
    this.setState(phone, conv.state, { ...conv.context, ...newContext });
  }

  cleanup() {
    runSql(`DELETE FROM conversations WHERE last_message_at < datetime('now', '-24 hours')`);
  }
}

module.exports = new ConversationService();
