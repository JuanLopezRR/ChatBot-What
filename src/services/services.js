const { queryAll, queryOne } = require('../database/init');

class ServiceCatalog {
  getAll() {
    return queryAll('SELECT * FROM services WHERE active = 1 ORDER BY name');
  }

  getByName(name) {
    return queryOne('SELECT * FROM services WHERE name LIKE ? AND active = 1', [`%${name}%`]);
  }

  getById(id) {
    return queryOne('SELECT * FROM services WHERE id = ?', [id]);
  }
}

module.exports = new ServiceCatalog();
