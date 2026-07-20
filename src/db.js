require('dotenv').config();
var db = {
  client: 'mysql',
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  },
  pool: {
    min: 1,
    max: 7
  },
  // fail fast instead of hanging forever if the DB is unreachable
  acquireConnectionTimeout: 15000,
}
module.exports.con = db;