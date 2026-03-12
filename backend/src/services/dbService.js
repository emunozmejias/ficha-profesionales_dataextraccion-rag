// src/services/dbService.js
const pool = require('../config/database');

/**
 * Guarda todos los datos de un CV en la base de datos usando una transacción.
 * Si algo falla, hace rollback completo.
 */
async function saveCVToDatabase(cvData, archivoCV) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ── 1. Profesional ─────────────────────────────────────────────
        const profResult = await client.query(
            `INSERT INTO profesional
                (nombre, rut, email, telefono, ciudad, resumen, archivo_cv)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
                cvData.profesional.nombre,
                cvData.profesional.rut      || null,
                cvData.profesional.email    || null,
                cvData.profesional.telefono || null,
                cvData.profesional.ciudad   || null,
                cvData.profesional.resumen  || null,
                archivoCV,
            ]
        );
        const profesionalId = profResult.rows[0].id;
        console.log(`   ✔ Profesional insertado con ID: ${profesionalId}`);

        // ── 2. Educación ────────────────────────────────────────────────
        for (const edu of cvData.educacion) {
            if (!edu.institucion || !edu.titulo) continue;
            await client.query(
                `INSERT INTO profesional_educacion
                    (profesional_id, institucion, titulo, anio_egreso, nivel)
                 VALUES ($1, $2, $3, $4, $5)`,
                [profesionalId, edu.institucion, edu.titulo,
                 edu.anio_egreso || null, edu.nivel || 'Otro']
            );
        }
        console.log(`   ✔ ${cvData.educacion.length} registros de educación insertados`);

        // ── 3. Certificaciones ──────────────────────────────────────────
        for (const cert of cvData.certificaciones) {
            if (!cert.nombre) continue;
            await client.query(
                `INSERT INTO profesional_certificacion
                    (profesional_id, nombre, institucion, anio, estado)
                 VALUES ($1, $2, $3, $4, $5)`,
                [profesionalId, cert.nombre,
                 cert.institucion || null,
                 cert.anio        || null,
                 cert.estado      || 'completado']
            );
        }
        console.log(`   ✔ ${cvData.certificaciones.length} certificaciones insertadas`);

        // ── 4. Skills generales (upsert en catálogo) ────────────────────
        for (const skill of cvData.skills_generales) {
            if (!skill.nombre) continue;
            const skillId = await upsertSkill(client, skill.nombre, skill.categoria);
            await client.query(
                `INSERT INTO profesional_skill (profesional_id, skill_id)
                 VALUES ($1, $2)
                 ON CONFLICT (profesional_id, skill_id) DO NOTHING`,
                [profesionalId, skillId]
            );
        }
        console.log(`   ✔ ${cvData.skills_generales.length} skills generales insertadas`);

        // ── 5. Experiencias laborales ───────────────────────────────────
        for (const exp of cvData.experiencias) {
            if (!exp.empresa || !exp.cargo) continue;

            const expResult = await client.query(
                `INSERT INTO experiencia_laboral
                    (profesional_id, empresa, cargo, fecha_inicio,
                     fecha_fin, es_actual, descripcion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                    profesionalId,
                    exp.empresa,
                    exp.cargo,
                    exp.fecha_inicio ? exp.fecha_inicio + '-01' : null,
                    exp.fecha_fin    ? exp.fecha_fin    + '-01' : null,
                    exp.es_actual    || false,
                    exp.descripcion  || null,
                ]
            );
            const expId = expResult.rows[0].id;

            // Skills de esta experiencia
            const skillsExp = exp.skills_utilizadas || [];
            for (const skillNombre of skillsExp) {
                if (!skillNombre) continue;
                const skillId = await upsertSkill(client, skillNombre, 'otro');
                await client.query(
                    `INSERT INTO experiencia_skill (experiencia_laboral_id, skill_id)
                     VALUES ($1, $2)
                     ON CONFLICT (experiencia_laboral_id, skill_id) DO NOTHING`,
                    [expId, skillId]
                );
                // También agregar a skills generales del profesional
                await client.query(
                    `INSERT INTO profesional_skill (profesional_id, skill_id)
                     VALUES ($1, $2)
                     ON CONFLICT (profesional_id, skill_id) DO NOTHING`,
                    [profesionalId, skillId]
                );
            }
        }
        console.log(`   ✔ ${cvData.experiencias.length} experiencias laborales insertadas`);

        await client.query('COMMIT');
        return profesionalId;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('   ❌ Error en transacción, rollback ejecutado:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Actualiza un profesional y todas sus tablas relacionadas (educación, certificaciones,
 * skills, experiencias). No modifica archivo_cv ni fecha_carga.
 * @param {number} profesionalId
 * @param {Object} cvData - Mismo formato que saveCVToDatabase (profesional, educacion, certificaciones, experiencias, skills_generales)
 */
async function updateProfesional(profesionalId, cvData) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ── 1. Actualizar datos del profesional (no tocamos archivo_cv ni fecha_carga) ──
        await client.query(
            `UPDATE profesional
             SET nombre = $1, rut = $2, email = $3, telefono = $4, ciudad = $5, resumen = $6
             WHERE id = $7`,
            [
                cvData.profesional.nombre,
                cvData.profesional.rut      || null,
                cvData.profesional.email    || null,
                cvData.profesional.telefono || null,
                cvData.profesional.ciudad   || null,
                cvData.profesional.resumen  || null,
                profesionalId,
            ]
        );

        // ── 2. Educación: reemplazar ────────────────────────────────────────────────
        await client.query('DELETE FROM profesional_educacion WHERE profesional_id = $1', [profesionalId]);
        for (const edu of cvData.educacion || []) {
            if (!edu.institucion || !edu.titulo) continue;
            await client.query(
                `INSERT INTO profesional_educacion (profesional_id, institucion, titulo, anio_egreso, nivel)
                 VALUES ($1, $2, $3, $4, $5)`,
                [profesionalId, edu.institucion, edu.titulo, edu.anio_egreso || null, edu.nivel || 'Otro']
            );
        }

        // ── 3. Certificaciones: reemplazar ───────────────────────────────────────────
        await client.query('DELETE FROM profesional_certificacion WHERE profesional_id = $1', [profesionalId]);
        for (const cert of cvData.certificaciones || []) {
            if (!cert.nombre) continue;
            await client.query(
                `INSERT INTO profesional_certificacion (profesional_id, nombre, institucion, anio, estado)
                 VALUES ($1, $2, $3, $4, $5)`,
                [profesionalId, cert.nombre, cert.institucion || null, cert.anio || null, cert.estado || 'completado']
            );
        }

        // ── 4. Skills generales: reemplazar ───────────────────────────────────────────
        await client.query('DELETE FROM profesional_skill WHERE profesional_id = $1', [profesionalId]);
        for (const skill of cvData.skills_generales || []) {
            if (!skill.nombre) continue;
            const skillId = await upsertSkill(client, skill.nombre, skill.categoria);
            await client.query(
                `INSERT INTO profesional_skill (profesional_id, skill_id) VALUES ($1, $2)
                 ON CONFLICT (profesional_id, skill_id) DO NOTHING`,
                [profesionalId, skillId]
            );
        }

        // ── 5. Experiencias: reemplazar (CASCADE borra experiencia_skill) ────────────
        await client.query('DELETE FROM experiencia_laboral WHERE profesional_id = $1', [profesionalId]);
        for (const exp of cvData.experiencias || []) {
            if (!exp.empresa || !exp.cargo) continue;
            const expResult = await client.query(
                `INSERT INTO experiencia_laboral
                    (profesional_id, empresa, cargo, fecha_inicio, fecha_fin, es_actual, descripcion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                    profesionalId,
                    exp.empresa,
                    exp.cargo,
                    exp.fecha_inicio ? (String(exp.fecha_inicio).length <= 7 ? exp.fecha_inicio + '-01' : exp.fecha_inicio) : null,
                    exp.fecha_fin    ? (String(exp.fecha_fin).length <= 7 ? exp.fecha_fin + '-01' : exp.fecha_fin) : null,
                    exp.es_actual || false,
                    exp.descripcion || null,
                ]
            );
            const expId = expResult.rows[0].id;
            const skillsExp = exp.skills_utilizadas || [];
            for (const skillNombre of skillsExp) {
                if (!skillNombre) continue;
                const skillId = await upsertSkill(client, skillNombre, 'otro');
                await client.query(
                    `INSERT INTO experiencia_skill (experiencia_laboral_id, skill_id) VALUES ($1, $2)
                     ON CONFLICT (experiencia_laboral_id, skill_id) DO NOTHING`,
                    [expId, skillId]
                );
                await client.query(
                    `INSERT INTO profesional_skill (profesional_id, skill_id) VALUES ($1, $2)
                     ON CONFLICT (profesional_id, skill_id) DO NOTHING`,
                    [profesionalId, skillId]
                );
            }
        }

        await client.query('COMMIT');
        return profesionalId;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('   ❌ Error en updateProfesional, rollback:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Inserta o actualiza un skill en el catálogo maestro y retorna su ID.
 */
async function upsertSkill(client, nombre, categoria) {
    const result = await client.query(
        `INSERT INTO skill (nombre, categoria)
         VALUES ($1, $2)
         ON CONFLICT (nombre) DO UPDATE
            SET categoria = CASE
                WHEN skill.categoria = 'otro' THEN EXCLUDED.categoria
                ELSE skill.categoria
            END
         RETURNING id`,
        [nombre.trim(), categoria || 'otro']
    );
    return result.rows[0].id;
}

/**
 * Obtiene todos los profesionales con resumen (usa la vista)
 */
async function getProfesionales({ page = 1, limit = 20, search = '' }) {
    const offset = (page - 1) * limit;
    let query, params;

    if (search) {
        query = `
            SELECT * FROM vista_profesional_resumen
            WHERE nombre ILIKE $1
               OR ultima_empresa ILIKE $1
               OR ultimo_cargo ILIKE $1
               OR $1 ILIKE ANY(skills::text[])
            ORDER BY fecha_carga DESC
            LIMIT $2 OFFSET $3`;
        params = [`%${search}%`, limit, offset];
    } else {
        query = `
            SELECT * FROM vista_profesional_resumen
            ORDER BY fecha_carga DESC
            LIMIT $1 OFFSET $2`;
        params = [limit, offset];
    }

    const result = await pool.query(query, params);

    // Count total
    const countQuery = search
        ? `SELECT COUNT(*) FROM vista_profesional_resumen
           WHERE nombre ILIKE $1 OR ultima_empresa ILIKE $1 OR ultimo_cargo ILIKE $1`
        : `SELECT COUNT(*) FROM vista_profesional_resumen`;
    const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);

    return {
        data:  result.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
    };
}

/**
 * Obtiene el detalle completo de un profesional por ID
 */
async function getProfesionalById(id) {
    const prof = await pool.query(
        'SELECT * FROM profesional WHERE id = $1 AND activo = TRUE', [id]);
    if (!prof.rows.length) return null;

    const educacion = await pool.query(
        'SELECT * FROM profesional_educacion WHERE profesional_id = $1 ORDER BY anio_egreso DESC', [id]);

    const certificaciones = await pool.query(
        'SELECT * FROM profesional_certificacion WHERE profesional_id = $1 ORDER BY anio DESC', [id]);

    const experiencias = await pool.query(
        `SELECT el.*, array_agg(s.nombre) FILTER (WHERE s.nombre IS NOT NULL) AS skills
         FROM experiencia_laboral el
         LEFT JOIN experiencia_skill es ON es.experiencia_laboral_id = el.id
         LEFT JOIN skill s ON s.id = es.skill_id
         WHERE el.profesional_id = $1
         GROUP BY el.id
         ORDER BY COALESCE(el.fecha_fin, CURRENT_DATE) DESC`, [id]);

    const skills = await pool.query(
        `SELECT s.id, s.nombre, s.categoria, ps.nivel
         FROM profesional_skill ps
         JOIN skill s ON s.id = ps.skill_id
         WHERE ps.profesional_id = $1
         ORDER BY s.categoria, s.nombre`, [id]);

    return {
        ...prof.rows[0],
        educacion:       educacion.rows,
        certificaciones: certificaciones.rows,
        experiencias:    experiencias.rows,
        skills:          skills.rows,
    };
}

/**
 * Busca profesionales que tengan TODAS las skills indicadas
 */
async function buscarPorSkills(skillsArray) {
    const result = await pool.query(
        'SELECT * FROM buscar_por_skills($1)', [skillsArray]);
    return result.rows;
}

/**
 * Obtiene el catálogo de skills con cantidad de profesionales
 */
async function getSkillsCatalogo() {
    const result = await pool.query(`
        SELECT s.id, s.nombre, s.categoria,
               COUNT(DISTINCT ps.profesional_id) AS num_profesionales
        FROM skill s
        LEFT JOIN profesional_skill ps ON ps.skill_id = s.id
        GROUP BY s.id
        ORDER BY num_profesionales DESC, s.nombre`);
    return result.rows;
}

/**
 * Elimina (soft delete) un profesional
 */
async function deleteProfesional(id) {
    const result = await pool.query(
        'UPDATE profesional SET activo = FALSE WHERE id = $1 RETURNING id', [id]);
    return result.rows.length > 0;
}

module.exports = {
    saveCVToDatabase,
    updateProfesional,
    getProfesionales,
    getProfesionalById,
    buscarPorSkills,
    getSkillsCatalogo,
    deleteProfesional,
};
