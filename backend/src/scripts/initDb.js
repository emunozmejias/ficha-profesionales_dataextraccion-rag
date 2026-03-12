// src/scripts/initDb.js
// Ejecutar con: node src/scripts/initDb.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function initDatabase() {
    console.log('🗄️  Inicializando base de datos...');
    console.log(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`   Base de datos: ${process.env.DB_NAME}\n`);

    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    const sql        = fs.readFileSync(schemaPath, 'utf8');

    const client = await pool.connect();
    try {
        await client.query(sql);
        console.log('✅ Schema creado exitosamente');
        console.log('✅ Datos semilla insertados');
        console.log('\n🎉 Base de datos inicializada correctamente\n');
    } catch (err) {
        console.error('❌ Error al inicializar la BD:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

initDatabase();
