const express = require('express');
const router = express.Router();
const messageHandler = require('../handlers/messageHandler');
const { logger } = require('../utils/logger');

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    logger.debug('Webhook recibido:', JSON.stringify(body, null, 2));

    let phone, name, text, isGroup = false;

    if (body.type === 'message' || body.event === 'messages.upsert') {
      const msg = body.data?.message || body.message || {};
      const key = body.data?.key || {};

      phone = key.remoteJid || body.from || body.phone;
      name = body.data?.pushName || body.pushName || 'Cliente';
      text = msg.conversation || msg.extendedTextMessage?.text || msg.text || body.text || '';
      isGroup = phone?.includes('@g.us') || false;

      if (!phone || !text) {
        logger.debug('Mensaje sin phone o text, ignorando');
        return res.sendStatus(200);
      }

      phone = phone.replace('@s.whatsapp.net', '').replace('@lid', '');
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
      }
    } else if (body.from && body.text) {
      phone = body.from.replace('@s.whatsapp.net', '');
      name = body.pushName || body.name || 'Cliente';
      text = body.text;
      isGroup = body.from?.includes('@g.us') || false;
    }

    if (!phone || !text) {
      logger.debug('No se pudo extraer información del mensaje');
      return res.sendStatus(200);
    }

    logger.info(`📱 Mensaje de ${name} (${phone}): "${text}"`);

    await messageHandler.handleIncoming({
      phone,
      name,
      text,
      isGroup
    });

    res.sendStatus(200);
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
