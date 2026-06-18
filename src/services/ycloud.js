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
      const response = await this.client.post('/whatsapp/messages', {
        from: YCLOUD_PHONE_NUMBER,
        to: to,
        type: 'text',
        text: { body: message }
      });
      logger.info(`Mensaje enviado a ${to}`);
      return response.data;
    } catch (error) {
      logger.error(`Error enviando mensaje a ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendButtons(to, body, buttons) {
    try {
      const response = await this.client.post('/whatsapp/messages', {
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
      logger.error(`Error enviando botones a ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendList(to, body, buttonText, sections) {
    try {
      const response = await this.client.post('/whatsapp/messages', {
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
      logger.error(`Error enviando lista a ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendLocation(to, latitude, longitude, name, address) {
    try {
      const response = await this.client.post('/whatsapp/messages', {
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
      logger.error(`Error enviando ubicación a ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendImage(to, imageUrl, caption) {
    try {
      const response = await this.client.post('/whatsapp/messages', {
        from: YCLOUD_PHONE_NUMBER,
        to: to,
        type: 'image',
        image: {
          link: imageUrl,
          caption
        }
      });
      logger.info(`Imagen enviada a ${to}`);
      return response.data;
    } catch (error) {
      logger.error(`Error enviando imagen a ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendDocument(to, documentUrl, filename, caption) {
    try {
      const response = await this.client.post('/whatsapp/messages', {
        from: YCLOUD_PHONE_NUMBER,
        to: to,
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          caption
        }
      });
      logger.info(`Documento enviado a ${to}`);
      return response.data;
    } catch (error) {
      logger.error(`Error enviando documento a ${to}: ${error.message}`);
      throw error;
    }
  }

  async markAsRead(messageId) {
    try {
      await this.client.post('/whatsapp/messages', {
        from: YCLOUD_PHONE_NUMBER,
        to: 'status',
        type: 'text',
        text: { body: '' }
      });
    } catch (error) {
      logger.error(`Error marcando mensaje como leído: ${error.message}`);
    }
  }
}

module.exports = new YCloudService();
