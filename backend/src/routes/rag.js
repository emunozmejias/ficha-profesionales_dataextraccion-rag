// src/routes/rag.js
// Búsqueda en lenguaje natural sobre los CVs indexados (RAG)
const express = require('express');
const router = express.Router();
const { searchRag } = require('../services/ragService');

/**
 * POST /api/rag/buscar
 * Body: { query: string }
 * Respuesta: { answer: string, sources: [{ archivo_cv, profesional_nombre, profesional_id }] }
 */
router.post('/buscar', async (req, res) => {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'El campo "query" es requerido y no puede estar vacío.' });
    }

    try {
        const result = await searchRag(query.trim());
        res.json(result);
    } catch (error) {
        console.error('❌ Error en búsqueda RAG:', error.message);
        res.status(500).json({
            error: 'Error al realizar la búsqueda.',
            detalle: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

module.exports = router;
