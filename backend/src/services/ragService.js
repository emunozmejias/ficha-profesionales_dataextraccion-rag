// src/services/ragService.js
// RAG: indexación de CVs en vectores y búsqueda en lenguaje natural
const pool = require('../config/database');
const { getEmbedding, getEmbeddings } = require('./embeddingService');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '5', 10);
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

/**
 * Prefijo para que cada chunk identifique al profesional (mejora respuestas RAG con varios CVs).
 */
function chunkWithProfesional(nombre, contenido) {
    const nombreSafe = (nombre || 'N/A').trim();
    return `Profesional: ${nombreSafe}. ${contenido}`.trim();
}

/**
 * Convierte el JSON de un CV en fragmentos de texto para embedir (por sección).
 * Cada chunk incluye al inicio "Profesional: [nombre]. " para que la respuesta RAG
 * pueda indicar todos los profesionales de los que se obtuvieron fragmentos.
 * @param {Object} cvData - Objeto con profesional, educacion, experiencias, etc.
 * @returns {string[]} - Array de textos
 */
function buildChunksFromCVData(cvData) {
    const chunks = [];
    const p = cvData.profesional || {};
    const nombre = p.nombre || 'N/A';

    chunks.push(chunkWithProfesional(nombre,
        `Datos del profesional: Nombre: ${p.nombre || 'N/A'}. ` +
        `RUT: ${p.rut || 'N/A'}. Email: ${p.email || 'N/A'}. Teléfono: ${p.telefono || 'N/A'}. ` +
        `Ciudad: ${p.ciudad || 'N/A'}. Resumen: ${(p.resumen || '').slice(0, 500)}.`
    ));

    (cvData.educacion || []).forEach((e, i) => {
        chunks.push(chunkWithProfesional(nombre,
            `Educación ${i + 1}: ${e.titulo || ''} en ${e.institucion || ''}. ` +
            `Año egreso: ${e.anio_egreso || 'N/A'}. Nivel: ${e.nivel || 'N/A'}.`
        ));
    });

    (cvData.certificaciones || []).forEach((c, i) => {
        chunks.push(chunkWithProfesional(nombre,
            `Certificación ${i + 1}: ${c.nombre || ''}. ` +
            `Institución: ${c.institucion || 'N/A'}. Año: ${c.anio || 'N/A'}. Estado: ${c.estado || 'completado'}.`
        ));
    });

    (cvData.experiencias || []).forEach((ex, i) => {
        const skills = (ex.skills_utilizadas || []).join(', ');
        chunks.push(chunkWithProfesional(nombre,
            `Experiencia ${i + 1}: En ${ex.empresa || ''} como ${ex.cargo || ''}. ` +
            `Desde ${ex.fecha_inicio || 'N/A'} hasta ${ex.fecha_fin || 'actualidad'}. ` +
            `Es actual: ${ex.es_actual ? 'Sí' : 'No'}. ` +
            `Descripción: ${(ex.descripcion || '').slice(0, 400)}. ` +
            (skills ? `Tecnologías: ${skills}.` : '')
        ));
    });

    const skillsList = (cvData.skills_generales || []).map(s => s.nombre).filter(Boolean);
    if (skillsList.length) {
        chunks.push(chunkWithProfesional(nombre, `Skills y tecnologías: ${skillsList.join(', ')}.`));
    }

    return chunks.filter(c => c && c.trim().length > 0);
}

/**
 * Formatea un vector para INSERT en PostgreSQL (tipo vector)
 */
function vectorToPg(embedding) {
    return '[' + embedding.join(',') + ']';
}

/**
 * Indexa un CV en la base vectorial (documento_rag + chunks con embeddings)
 * @param {number} profesionalId
 * @param {string} archivoCv - Nombre del archivo PDF
 * @param {string} profesionalNombre
 * @param {Object} cvData - JSON extraído del CV
 */
async function indexDocument(profesionalId, archivoCv, profesionalNombre, cvData) {
    const chunks = buildChunksFromCVData(cvData);
    if (chunks.length === 0) return;

    const client = await pool.connect();
    try {
        const docResult = await client.query(
            `INSERT INTO documento_rag (profesional_id, archivo_cv, profesional_nombre)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [profesionalId, archivoCv, profesionalNombre]
        );
        const documentoRagId = docResult.rows[0].id;

        const embeddings = await getEmbeddings(chunks);

        for (let i = 0; i < chunks.length; i++) {
            const vec = vectorToPg(embeddings[i]);
            await client.query(
                `INSERT INTO documento_rag_chunk (documento_rag_id, contenido, embedding)
                 VALUES ($1, $2, $3::vector)`,
                [documentoRagId, chunks[i], vec]
            );
        }

        console.log(`   ✔ RAG: indexados ${chunks.length} chunks para ${profesionalNombre}`);
    } finally {
        client.release();
    }
}

/**
 * Búsqueda RAG: embedir consulta, recuperar chunks similares, generar respuesta con Claude
 * @param {string} query - Pregunta en lenguaje natural
 * @returns {Promise<{ answer: string, sources: Array<{ archivo_cv, profesional_nombre, profesional_id }> }>}
 */
async function searchRag(query) {
    const queryEmbedding = await getEmbedding(query);
    const vec = vectorToPg(queryEmbedding);

    const client = await pool.connect();
    let rows;
    try {
        // Similitud coseno: ordenar por distancia (<=>)
        const result = await client.query(
            `SELECT c.id, c.contenido, c.documento_rag_id,
                    d.archivo_cv, d.profesional_nombre, d.profesional_id
             FROM documento_rag_chunk c
             JOIN documento_rag d ON d.id = c.documento_rag_id
             JOIN profesional p ON p.id = d.profesional_id AND p.activo = TRUE
             ORDER BY c.embedding <=> $1::vector
             LIMIT $2`,
            [vec, RAG_TOP_K]
        );
        rows = result.rows;
    } finally {
        client.release();
    }

    if (rows.length === 0) {
        return {
            answer: 'No hay currículums indexados aún, o no se encontró información relevante para tu consulta. Carga algunos CVs desde "Cargar CV" para poder buscar.',
            sources: [],
        };
    }

    const context = rows.map(r => r.contenido).join('\n\n---\n\n');
    const uniqueSources = [];
    const seen = new Set();
    rows.forEach(r => {
        const key = `${r.documento_rag_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueSources.push({
                archivo_cv: r.archivo_cv,
                profesional_nombre: r.profesional_nombre,
                profesional_id: r.profesional_id,
            });
        }
    });

    const prompt = `Eres un asistente que responde preguntas sobre los currículums de profesionales. 
A continuación tienes fragmentos de CVs extraídos de una base de datos. Responde la pregunta del usuario 
basándote ÚNICAMENTE en esa información. Si la información no está en los fragmentos, dilo. 
Responde en español de forma clara y concisa.

Fragmentos de CVs:
${context}

Pregunta del usuario: ${query}`;

    const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
    });

    const answerText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim();

    return {
        answer: answerText || 'No pude generar una respuesta.',
        sources: uniqueSources,
    };
}

/**
 * Elimina del índice RAG todos los vectores asociados a un profesional.
 * Se usa antes de reindexar tras editar la ficha (borrar vectores viejos, luego indexar de nuevo).
 * @param {number} profesionalId
 */
async function deleteRagByProfesionalId(profesionalId) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM documento_rag WHERE profesional_id = $1', [profesionalId]);
        // documento_rag_chunk tiene FK ON DELETE CASCADE, se borran solos
    } finally {
        client.release();
    }
}

module.exports = { indexDocument, searchRag, buildChunksFromCVData, deleteRagByProfesionalId };
