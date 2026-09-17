const { Sequelize } = require('sequelize');

// env.js peut être chargé après dotenv dans server.js ; on lit process.env
// avec les mêmes défauts pour seed/migrate autonomes.
const isProd = (process.env.NODE_ENV || 'development').toLowerCase() === 'production';

const sequelize = new Sequelize(
    process.env.DB_NAME || 'glo_db',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        dialect: 'mysql',
        logging: process.env.DB_LOGGING === '1' ? console.log : false,
        dialectOptions: (process.env.DB_SSL === '1' || process.env.DB_SSL === 'true')
            ? {
                ssl: {
                    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== '0'
                }
            }
            : {},
        pool: {
            max: parseInt(process.env.DB_POOL_MAX, 10) || (isProd ? 10 : 5),
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        define: {
            underscored: true
        }
    }
);

module.exports = sequelize;
