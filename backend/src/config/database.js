// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'ficha_profesionales',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD,
    max:      parseInt(process.env.DB_POOL_MAX     || '10'),
    idleTimeoutMillis:    parseInt(process.env.DB_POOL_IDLE    || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE || '60000'),
});

// Verificar conexión al iniciar
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a PostgreSQL:', err.message);
        return;
    }
    release();
    console.log(`✅ Conectado a PostgreSQL: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});

module.exports = pool;
