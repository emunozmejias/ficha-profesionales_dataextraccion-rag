// src/server.js
require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const profesionalesRouter = require('./routes/profesionales');
const ragRouter = require('./routes/rag');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors({
    origin:  process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Rutas ───────────────────────────────────────────────────────────────────
app.use('/api/profesionales', profesionalesRouter);
app.use('/api/rag', ragRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status:  'ok',
        service: 'Ficha de Profesionales API',
        time:    new Date().toISOString(),
    });
});

// ── Manejo global de errores ────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('❌ Error no controlado:', err.message);

    // Error de Multer (archivo demasiado grande, tipo incorrecto)
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo PDF supera el tamaño máximo permitido (10 MB)' });
    }
    if (err.message === 'Solo se permiten archivos PDF') {
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({
        error:   'Error interno del servidor',
        detalle: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// ── Iniciar servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║   🚀 Ficha de Profesionales - API          ║');
    console.log(`║   Puerto: ${PORT}                              ║`);
    console.log(`║   Entorno: ${process.env.NODE_ENV || 'development'}                    ║`);
    console.log('╚═══════════════════════════════════════════╝\n');
});

module.exports = app;
