#!/usr/bin/env node
/**
 * Reindexa en RAG los profesionales que aún NO están en documento_rag.
 * Usa los datos ya guardados en la BD (no vuelve a leer el PDF).
 * Requiere: OPENAI_API_KEY en .env
 *
 * Uso: node scripts/reindexRag.js
 *      (ejecutar desde la carpeta backend)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const pool = require('../src/config/database');
const { getProfesionalById } = require('../src/services/dbService');
const { indexDocument } = require('../src/services/ragService');

/**
 * Convierte el resultado de getProfesionalById al formato cvData que espera indexDocument
 */
function buildCvDataFromProfesional(prof) {
    const formatYearMonth = (d) => {
        if (!d) return null;
        const date = d instanceof Date ? d : new Date(d);
        return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
    };

    return {
        profesional: {
            nombre:   prof.nombre,
            rut:      prof.rut ?? null,
            email:    prof.email ?? null,
            telefono: prof.telefono ?? null,
            ciudad:   prof.ciudad ?? null,
            resumen:  prof.resumen ?? null,
        },
        educacion: (prof.educacion || []).map((e) => ({
            institucion:  e.institucion,
            titulo:       e.titulo,
            anio_egreso:  e.anio_egreso,
            nivel:        e.nivel || 'Otro',
        })),
        certificaciones: (prof.certificaciones || []).map((c) => ({
            nombre:      c.nombre,
            institucion: c.institucion ?? null,
            anio:        c.anio ?? null,
            estado:      c.estado || 'completado',
        })),
        experiencias: (prof.experiencias || []).map((ex) => ({
            empresa:           ex.empresa,
            cargo:             ex.cargo,
            fecha_inicio:      formatYearMonth(ex.fecha_inicio),
            fecha_fin:         formatYearMonth(ex.fecha_fin),
            es_actual:         !!ex.es_actual,
            descripcion:       ex.descripcion ?? null,
            skills_utilizadas: ex.skills && Array.isArray(ex.skills) ? ex.skills.filter(Boolean) : [],
        })),
        skills_generales: (prof.skills || []).map((s) => ({
            nombre:    s.nombre,
            categoria: s.categoria || 'otro',
        })),
    };
}

async function getProfesionalesNoIndexados() {
    const res = await pool.query(`
        SELECT p.id, p.nombre, p.archivo_cv
        FROM profesional p
        WHERE p.activo = TRUE
          AND p.archivo_cv IS NOT NULL
          AND p.archivo_cv != ''
          AND NOT EXISTS (
              SELECT 1 FROM documento_rag d WHERE d.profesional_id = p.id
          )
        ORDER BY p.id
    `);
    return res.rows;
}

async function main() {
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ Falta OPENAI_API_KEY en .env. No se puede generar embeddings.');
        process.exit(1);
    }

    console.log('Buscando profesionales activos que aún no están indexados en RAG...\n');

    const pendientes = await getProfesionalesNoIndexados();

    if (pendientes.length === 0) {
        console.log('No hay profesionales pendientes de indexar. Todos los CVs con archivo ya están en RAG.');
        process.exit(0);
    }

    console.log(`Encontrados ${pendientes.length} profesional(es) por indexar.\n`);

    let ok = 0;
    let fail = 0;

    for (const row of pendientes) {
        const { id, nombre, archivo_cv } = row;
        process.stdout.write(`  [${id}] ${nombre} ... `);

        try {
            const prof = await getProfesionalById(id);
            if (!prof) {
                console.log('omitido (no encontrado o inactivo)');
                continue;
            }
            const cvData = buildCvDataFromProfesional(prof);
            await indexDocument(id, archivo_cv, nombre, cvData);
            console.log('OK');
            ok++;
        } catch (err) {
            console.log('ERROR:', err.message);
            fail++;
        }
    }

    console.log('\n---');
    console.log(`Indexados: ${ok}. Errores: ${fail}.`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
