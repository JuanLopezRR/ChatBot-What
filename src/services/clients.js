const { queryAll, queryOne, runSql } = require('../database/init');

class ClientService {
  async getOrCreateClient(phone, name = 'Cliente') {
    let client = await queryOne('SELECT * FROM clients WHERE phone = $1', [phone]);
    
    if (!client) {
      const result = await runSql('INSERT INTO clients (phone, name) VALUES ($1, $2) RETURNING id', [phone, name]);
      client = await queryOne('SELECT * FROM clients WHERE id = $1', [result.lastId]);
    } else if (client.name === 'Cliente' && name !== 'Cliente') {
      await runSql('UPDATE clients SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [name, client.id]);
      client.name = name;
    }
    
    return client;
  }

  async getClientByPhone(phone) {
    return await queryOne('SELECT * FROM clients WHERE phone = $1', [phone]);
  }

  async updateClient(phone, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    
    if (data.name) { fields.push(`name = $${idx}`); values.push(data.name); idx++; }
    if (data.email) { fields.push(`email = $${idx}`); values.push(data.email); idx++; }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(phone);
      await runSql(`UPDATE clients SET ${fields.join(', ')} WHERE phone = $${idx}`, values);
    }
  }

  async getAllClients(limit = 50) {
    return await queryAll('SELECT * FROM clients ORDER BY created_at DESC LIMIT $1', [limit]);
  }
}

module.exports = new ClientService();
