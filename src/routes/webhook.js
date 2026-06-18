const express = require('express');
const router = express.Router();
const messageHandler = require('../handlers/messageHandler');
const { logger } = require('../utils/logger');

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    logger.info('════════════════════════════════════════');
    logger.info('📩 WEBHOOK RECIBIDO:');
    logger.info(JSON.stringify(body, null, 2));
    logger.info('════════════════════════════════════════');

    res.sendStatus(200);

    let phone = null;
    let name = null;
    let text = null;
    let isGroup = false;
    let messageId = null;

    const event = body.event || '';
    const type = body.type || '';

    logger.info(`Evento: "${event}" | Tipo: "${type}"`);

    if (event.includes('message') || event.includes('received')) {
      const msg = body.data || {};
      
      if (msg.fromMe === true || msg.fromMe === 'true') {
        logger.info('Mensaje propio, ignorando');
        return;
      }

      phone = msg.from || msg.key?.remoteJid || msg.remoteJid;
      name = msg.pushName || msg.pushName || 'Cliente';
      text = msg.text?.body || msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      isGroup = phone?.includes('@g.us') || false;
      messageId = msg.id || msg.key?.id;

      logger.info(`Extraído - Phone: ${phone}, Name: ${name}, Text: "${text}", IsGroup: ${isGroup}`);
    } 
    else if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (value?.messages?.[0]) {
        const msg = value.messages[0];
        phone = msg.from;
        name = value.contacts?.[0]?.profile?.name || 'Cliente';
        text = msg.text?.body || '';
        isGroup = false;
        messageId = msg.id;
      }
    }
    else if (body.from && body.text) {
      phone = body.from;
      name = body.pushName || body.name || 'Cliente';
      text = body.text;
      isGroup = body.from?.includes('@g.us') || false;
      messageId = body.id;
    }
    else if (body.key || body.message) {
      const msg = body;
      phone = msg.key?.remoteJid || msg.from;
      name = msg.pushName || 'Cliente';
      text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      isGroup = phone?.includes('@g.us') || false;
      messageId = msg.key?.id;
    }

    if (!phone || !text) {
      logger.warn(`No se pudo extraer datos - phone: ${phone}, text: "${text}"`);
      logger.warn('Body completo: ' + JSON.stringify(body));
      return;
    }

    phone = phone.replace('@s.whatsapp.net', '').replace('@lid', '');

    logger.info(`📱 Mensaje de ${name} (${phone}): "${text}"`);

    if (messageId) {
      try {
        const ycloud = require('../services/ycloud');
        await ycloud.typingIndicator(messageId);
      } catch (e) {}
    }

    await messageHandler.handleIncoming({
      phone,
      name,
      text,
      isGroup
    });

  } catch (error) {
    logger.error('Error en webhook:', error);
    res.sendStatus(200);
  }
});

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.YCLOUD_VERIFY_TOKEN) {
    logger.info('Webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;
