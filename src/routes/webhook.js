const express = require('express');
const router = express.Router();
const messageHandler = require('../handlers/messageHandler');
const { logger } = require('../utils/logger');

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    logger.debug('Webhook recibido:', JSON.stringify(body, null, 2));

    res.sendStatus(200);

    let phone = null;
    let name = null;
    let text = null;
    let isGroup = false;
    let messageId = null;

    if (body.event === 'whatsapp.message.received') {
      const msg = body.data;
      if (!msg || msg.fromMe) return;

      phone = msg.from;
      name = msg.pushName || 'Cliente';
      text = msg.text?.body || '';
      isGroup = msg.remoteJid?.includes('@g.us') || false;
      messageId = msg.id;
    } else if (body.object === 'whatsapp_business_account') {
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
    } else if (body.type === 'message') {
      phone = body.data?.key?.remoteJid || body.from;
      name = body.data?.pushName || body.pushName || 'Cliente';
      text = body.data?.message?.conversation || 
             body.data?.message?.extendedTextMessage?.text || 
             body.text || '';
      isGroup = phone?.includes('@g.us') || false;
      messageId = body.data?.key?.id;
    }

    if (!phone || !text) {
      logger.debug('Mensaje sin phone o text, ignorando');
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
