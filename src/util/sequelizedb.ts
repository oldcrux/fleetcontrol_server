
require("dotenv").config();
const { Sequelize } = require('sequelize');

// Create a single Sequelize instance
// const sequelize = new Sequelize(process.env.MYSQL_DATABASE, process.env.MYSQL_USER, process.env.MYSQL_PASSWORD, {

//   host: process.env.MYSQL_HOST,
//   port: process.env.MYSQL_PORT,
//   dialect: process.env.MYSQL_DIALECT,
//   pool: {
//     max: 10,
//     min: 0,
//     acquire: 30000,
//     idle: 10000
//   },
//   logging: false, // Disable logging (optional)
// });

const sequelize = new Sequelize(process.env.PG_DATABASE, process.env.PG_USER, process.env.PG_PASSWORD, {
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  dialect: process.env.PG_DIALECT,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  logging: false, // Disable logging (optional)
});

// Export the Sequelize instance for reuse
export default sequelize;
