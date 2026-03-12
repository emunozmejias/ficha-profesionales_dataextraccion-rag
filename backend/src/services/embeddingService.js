// src/services/embeddingService.js
// Genera embeddings con OpenAI para RAG (text-embedding-3-small: 1536 dimensiones)
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

/**
 * Obtiene el vector de embedding para un texto
 * @param {string} text - Texto a embedir
 * @returns {Promise<number[]>} - Array de 1536 dimensiones
 */
async function getEmbedding(text) {
    if (!text || String(text).trim().length === 0) {
        throw new Error('El texto para embedding no puede estar vacío');
    }
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.trim().slice(0, 8000), // límite razonable por chunk
    });
    return response.data[0].embedding;
}

/**
 * Embeddings para varios textos en una sola llamada (más eficiente)
 * @param {string[]} texts - Array de textos
 * @returns {Promise<number[][]>}
 */
async function getEmbeddings(texts) {
    const trimmed = texts.map(t => (t && String(t).trim().slice(0, 8000)) || ' ');
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: trimmed,
    });
    return response.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

module.exports = { getEmbedding, getEmbeddings };
