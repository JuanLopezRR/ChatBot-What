const express = require('express');
const router = express.Router();
const messageHandler = require('../handlers/messageHandler');
const { logger } = require('../utils/logger');

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    res.sendStatus(200);

    let phone = null;
    let name = null;
    let text = null;
    let isGroup = false;
    let messageId = null;

    const type = body.type || '';

    if (type === 'whatsapp.inbound_message.received') {
      const msg = body.whatsappInboundMessage;
      if (!msg) return;

      phone = msg.from;
      name = msg.customerProfile?.name || 'Cliente';
      text = msg.text?.body || '';
      isGroup = false;
      messageId = msg.id || msg.wamid;
    } 
    else if (body.event === 'whatsapp.message.received') {
      const msg = body.data || {};
      if (msg.fromMe) return;
      phone = msg.from;
      name = msg.pushName || 'Cliente';
      text = msg.text?.body || '';
      isGroup = msg.remoteJid?.includes('@g.us') || false;
      messageId = msg.id;
    }
    else if (body.object === 'whatsapp_business_account') {
      const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (msg) {
        phone = msg.from;
        name = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || 'Cliente';
        text = msg.text?.body || '';
        messageId = msg.id;
      }
    }

    if (!phone || !text) return;

    phone = phone.replace('+', '').replace('@s.whatsapp.net', '').replace('@lid', '');

    logger.info(`📱 Mensaje de ${name} (${phone}): "${text}"`);

    if (messageId) {
      try {
        const ycloud = require('../services/ycloud');
        await ycloud.markAsRead(messageId);
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
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;
