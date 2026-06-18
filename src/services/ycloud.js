const axios = require('axios');
const { logger } = require('../utils/logger');

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY;
const YCLOUD_API_URL = process.env.YCLOUD_API_URL || 'https://api.ycloud.com/v2';
const YCLOUD_PHONE_NUMBER = process.env.YCLOUD_PHONE_NUMBER;

class YCloudService {
  constructor() {
    this.client = axios.create({
      baseURL: YCLOUD_API_URL,
      headers: {
        'X-API-KEY': YCLOUD_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async sendText(to, message) {
    try {
      const toNumber = to.startsWith('+') ? to : `+${to}`;
      
      const response = await this.client.post('/whatsapp/messages/sendDirectly', {
        from: YCLOUD_PHONE_NUMBER,
        to: toNumber,
        type: 'text',
        text: { body: message }
      });
      logger.info(`Mensaje enviado a ${to}`);
      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Error enviando mensaje a ${to}: ${errMsg}`);
      throw error;
    }
  }

  async sendButtons(to, body, buttons) {
    try {
      const response = await this.client.post('/whatsapp/messages/sendDirectly', {
        from: YCLOUD_PHONE_NUMBER,
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${idx}`,
                title: btn.title
              }
            }))
          }
        }
      });
      logger.info(`Botones enviados a ${to}`);
      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Error enviando botones a ${to}: ${errMsg}`);
      throw error;
    }
  }

  async sendList(to, body, buttonText, sections) {
    try {
      const response = await this.client.post('/whatsapp/messages/sendDirectly', {
        from: YCLOUD_PHONE_NUMBER,
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: body },
          action: {
            button: buttonText,
            sections: sections
          }
        }
      });
      logger.info(`Lista enviada a ${to}`);
      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Error enviando lista a ${to}: ${errMsg}`);
      throw error;
    }
  }

  async sendLocation(to, latitude, longitude, name, address) {
    try {
      const response = await this.client.post('/whatsapp/messages/sendDirectly', {
        from: YCLOUD_PHONE_NUMBER,
        to: to,
        type: 'location',
        location: {
          latitude,
          longitude,
          name,
          address
        }
      });
      logger.info(`Ubicación enviada a ${to}`);
      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Error enviando ubicación a ${to}: ${errMsg}`);
      throw error;
    }
  }

  async markAsRead(messageId) {
    try {
      await this.client.post(`/whatsapp/inboundMessages/${messageId}/markAsRead`);
      logger.debug(`Mensaje ${messageId} marcado como leído`);
    } catch (error) {
      logger.debug(`No se pudo marcar mensaje como leído: ${error.message}`);
    }
  }

  async typingIndicator(messageId) {
    try {
      await this.client.post(`/whatsapp/inboundMessages/${messageId}/typingIndicator`);
    } catch (error) {
      logger.debug(`No se pudo mostrar indicador de escritura: ${error.message}`);
    }
  }
}

module.exports = new YCloudService();
