const { queryAll, queryOne, runSql } = require('../database/init');
const { logger } = require('../utils/logger');

class ClientService {
  getOrCreateClient(phone, name = 'Cliente') {
    let client = queryOne('SELECT * FROM clients WHERE phone = ?', [phone]);
    
    if (!client) {
      const result = runSql('INSERT INTO clients (phone, name) VALUES (?, ?)', [phone, name]);
      client = queryOne('SELECT * FROM clients WHERE id = ?', [result.lastId]);
      logger.info(`Nuevo cliente registrado: ${phone} (${name})`);
    } else if (client.name === 'Cliente' && name !== 'Cliente') {
      runSql('UPDATE clients SET name = ?, updated_at = datetime(\'now\') WHERE id = ?', [name, client.id]);
      client.name = name;
    }
    
    return client;
  }

  getClientByPhone(phone) {
    return queryOne('SELECT * FROM clients WHERE phone = ?', [phone]);
  }

  updateClient(phone, data) {
    const fields = [];
    const values = [];
    
    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.email) { fields.push('email = ?'); values.push(data.email); }
    
    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(phone);
      runSql(`UPDATE clients SET ${fields.join(', ')} WHERE phone = ?`, values);
    }
  }

  getAllClients(limit = 50) {
    return queryAll('SELECT * FROM clients ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  getClientStats() {
    return queryOne(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as new_this_week,
        SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 ELSE 0 END) as new_this_month
      FROM clients
    `);
  }
}

module.exports = new ClientService();
