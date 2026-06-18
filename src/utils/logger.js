const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'chatbot.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, msg, ...args) {
  const timestamp = getTimestamp();
  const formatted = args.length > 0 ? `${msg} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}` : msg;
  return `[${timestamp}] [${level}] ${formatted}`;
}

const logger = {
  log: (msg, ...args) => {
    const line = formatMessage('LOG', msg, ...args);
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
  },
  info: (msg, ...args) => {
    const line = formatMessage('INFO', msg, ...args);
    console.log(`\x1b[36m${line}\x1b[0m`);
    fs.appendFileSync(LOG_FILE, line + '\n');
  },
  error: (msg, ...args) => {
    const line = formatMessage('ERROR', msg, ...args);
    console.error(`\x1b[31m${line}\x1b[0m`);
    fs.appendFileSync(LOG_FILE, line + '\n');
  },
  warn: (msg, ...args) => {
    const line = formatMessage('WARN', msg, ...args);
    console.warn(`\x1b[33m${line}\x1b[0m`);
    fs.appendFileSync(LOG_FILE, line + '\n');
  },
  debug: (msg, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      const line = formatMessage('DEBUG', msg, ...args);
      console.log(`\x1b[90m${line}\x1b[0m`);
    }
  }
};

module.exports = { logger };
