#!/usr/bin/env node
/**
 * Reindexa en RAG TODOS los profesionales que tienen archivo_cv.
 * Borra los vectores actuales de cada uno y vuelve a indexar con el formato
 * actual de chunks (incluye "Profesional: [nombre]. " al inicio de cada chunk).
 * Requiere: OPENAI_API_KEY en .env
 *
 * Uso: node scripts/reindexRagAll.js
 *      (ejecutar desde la carpeta backend)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const pool = require('../src/config/database');
const { getProfesionalById } = require('../src/services/dbService');
const { indexDocument, deleteRagByProfesionalId } = require('../src/services/ragService');

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

async function getAllProfesionalesConCv() {
    const res = await pool.query(`
        SELECT p.id, p.nombre, p.archivo_cv
        FROM profesional p
        WHERE p.activo = TRUE
          AND p.archivo_cv IS NOT NULL
          AND p.archivo_cv != ''
        ORDER BY p.id
    `);
    return res.rows;
}

async function main() {
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ Falta OPENAI_API_KEY en .env. No se puede generar embeddings.');
        process.exit(1);
    }

    console.log('Reindexando RAG para todos los profesionales con CV...\n');

    const profesionales = await getAllProfesionalesConCv();

    if (profesionales.length === 0) {
        console.log('No hay profesionales activos con archivo_cv.');
        process.exit(0);
    }

    console.log(`Encontrados ${profesionales.length} profesional(es). Se borrarán sus vectores y se reindexarán.\n`);

    let ok = 0;
    let fail = 0;

    for (const row of profesionales) {
        const { id, nombre, archivo_cv } = row;
        process.stdout.write(`  [${id}] ${nombre} ... `);

        try {
            await deleteRagByProfesionalId(id);
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
    console.log(`Reindexados: ${ok}. Errores: ${fail}.`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
