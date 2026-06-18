const { queryAll, queryOne } = require('../database/init');

class ServiceCatalog {
  async getAll() {
    return await queryAll('SELECT * FROM services WHERE active = 1 ORDER BY name');
  }

  async getByName(name) {
    return await queryOne('SELECT * FROM services WHERE name ILIKE $1 AND active = 1', [`%${name}%`]);
  }

  async getById(id) {
    return await queryOne('SELECT * FROM services WHERE id = $1', [id]);
  }
}

module.exports = new ServiceCatalog();
