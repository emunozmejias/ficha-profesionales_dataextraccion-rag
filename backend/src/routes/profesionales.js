// src/routes/profesionales.js
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const router   = express.Router();

//const { extractCVData }      = require('../services/localExtractionService');
const { extractCVData } = require('../services/claudeService');
const {
    saveCVToDatabase,
    updateProfesional,
    getProfesionales,
    getProfesionalById,
    buscarPorSkills,
    getSkillsCatalogo,
    deleteProfesional,
} = require('../services/dbService');
const { indexDocument, deleteRagByProfesionalId } = require('../services/ragService');

/**
 * Convierte el cuerpo de la API (mismo formato que GET /:id) a cvData para updateProfesional/indexDocument.
 */
function apiBodyToCvData(body) {
    const formatYearMonth = (d) => {
        if (!d) return null;
        const s = String(d);
        if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s.slice(0, 7);
        const date = new Date(d);
        return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
    };

    return {
        profesional: {
            nombre:   body.nombre,
            rut:      body.rut ?? null,
            email:    body.email ?? null,
            telefono: body.telefono ?? null,
            ciudad:   body.ciudad ?? null,
            resumen:  body.resumen ?? null,
        },
        educacion: (body.educacion || []).map((e) => ({
            institucion:  e.institucion,
            titulo:      e.titulo,
            anio_egreso: e.anio_egreso ?? null,
            nivel:       e.nivel || 'Otro',
        })),
        certificaciones: (body.certificaciones || []).map((c) => ({
            nombre:      c.nombre,
            institucion: c.institucion ?? null,
            anio:        c.anio ?? null,
            estado:      c.estado || 'completado',
        })),
        experiencias: (body.experiencias || []).map((ex) => ({
            empresa:           ex.empresa,
            cargo:             ex.cargo,
            fecha_inicio:      formatYearMonth(ex.fecha_inicio),
            fecha_fin:         formatYearMonth(ex.fecha_fin),
            es_actual:         !!ex.es_actual,
            descripcion:       ex.descripcion ?? null,
            skills_utilizadas: Array.isArray(ex.skills) ? ex.skills.filter(Boolean) : [],
        })),
        skills_generales: (body.skills || []).map((s) => ({
            nombre:    typeof s === 'string' ? s : s.nombre,
            categoria: typeof s === 'string' ? 'otro' : (s.categoria || 'otro'),
        })),
    };
}

// ── Configuración de Multer (almacenamiento local) ──────────────────────────
const uploadsPath = path.resolve(process.env.UPLOADS_PATH || './uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename:    (req, file, cb) => {
        const timestamp = Date.now();
        const safe      = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${timestamp}_${safe}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'), false);
        }
    },
});

// ── POST /api/profesionales/cargar-cv ───────────────────────────────────────
// Sube un PDF, lo procesa con Ollama (local) y guarda en la BD
// Sube un PDF, lo procesa con Claude y guarda en la BD
router.post('/cargar-cv', upload.single('cv'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo PDF' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;

    try {
        console.log(`\n📤 Procesando CV: ${req.file.originalname}`);

        // 1. Extraer datos con IA
        const cvData = await extractCVData(filePath);

        // 2. Guardar en la base de datos
        const profesionalId = await saveCVToDatabase(cvData, fileName);

        // 3. Indexar para RAG (búsqueda en lenguaje natural)
        if (process.env.OPENAI_API_KEY) {
            try {
                await indexDocument(profesionalId, fileName, cvData.profesional.nombre, cvData);
            } catch (ragErr) {
                console.warn('⚠️ RAG: no se pudo indexar el CV:', ragErr.message);
            }
        }

        res.status(201).json({
            success:                true,
            profesional_id:         profesionalId,
            nombre:                 cvData.profesional.nombre,
            skills_encontradas:     cvData.skills_generales.length,
            experiencias_encontradas: cvData.experiencias.length,
            archivo_guardado:       fileName,
            mensaje: `CV de ${cvData.profesional.nombre} cargado exitosamente`,
        });

    } catch (error) {
        // Si hubo error, eliminar el archivo subido
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error('❌ Error procesando CV:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── GET /api/profesionales ──────────────────────────────────────────────────
// Lista profesionales con paginación y búsqueda de texto
router.get('/', async (req, res) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    const result = await getProfesionales({
        page:   parseInt(page),
        limit:  parseInt(limit),
        search: search.trim(),
    });
    res.json(result);
});

// ── GET /api/profesionales/skills ───────────────────────────────────────────
// Catálogo de skills disponibles
router.get('/skills', async (req, res) => {
    const skills = await getSkillsCatalogo();
    res.json(skills);
});

// ── GET /api/profesionales/buscar-por-skills ────────────────────────────────
// Búsqueda por skills específicas: ?skills=Java,Angular,Docker (sin duplicados)
router.get('/buscar-por-skills', async (req, res) => {
    const { skills } = req.query;
    if (!skills) {
        return res.status(400).json({ error: 'Parámetro "skills" requerido' });
    }
    const skillsArray = [...new Set(skills.split(',').map(s => s.trim()).filter(Boolean))];
    const result = await buscarPorSkills(skillsArray);
    res.json(result);
});

// ── PUT /api/profesionales/:id ───────────────────────────────────────────────
// Actualiza la ficha de un profesional. Tras guardar en BD se eliminan los vectores
// RAG asociados y se reindexa con el JSON actualizado (mismo criterio que en carga de CV).
router.put('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    const current = await getProfesionalById(id);
    if (!current) {
        return res.status(404).json({ error: 'Profesional no encontrado' });
    }

    const body = req.body;
    if (!body || !body.nombre || !body.nombre.trim()) {
        return res.status(400).json({ error: 'El campo nombre es obligatorio' });
    }

    try {
        const cvData = apiBodyToCvData(body);
        await updateProfesional(id, cvData);

        // Sincronizar RAG: borrar vectores viejos y volver a indexar con el JSON actual
        await deleteRagByProfesionalId(id);
        if (process.env.OPENAI_API_KEY && current.archivo_cv) {
            try {
                await indexDocument(id, current.archivo_cv, cvData.profesional.nombre, cvData);
            } catch (ragErr) {
                console.warn('⚠️ RAG: no se pudo reindexar tras editar:', ragErr.message);
            }
        }

        res.json({
            success:    true,
            mensaje:    'Ficha actualizada correctamente',
            profesional_id: id,
        });
    } catch (error) {
        console.error('❌ Error actualizando profesional:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── GET /api/profesionales/:id ──────────────────────────────────────────────
// Detalle completo de un profesional
router.get('/:id', async (req, res) => {
    const profesional = await getProfesionalById(parseInt(req.params.id));
    if (!profesional) {
        return res.status(404).json({ error: 'Profesional no encontrado' });
    }
    res.json(profesional);
});

// ── GET /api/profesionales/:id/cv ───────────────────────────────────────────
// Descarga el PDF original del CV
router.get('/:id/cv', async (req, res) => {
    const profesional = await getProfesionalById(parseInt(req.params.id));
    if (!profesional || !profesional.archivo_cv) {
        return res.status(404).json({ error: 'Archivo CV no encontrado' });
    }
    const filePath = path.join(uploadsPath, profesional.archivo_cv);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo PDF no existe en el servidor' });
    }
    res.download(filePath, `CV_${profesional.nombre}.pdf`);
});

// ── DELETE /api/profesionales/:id ───────────────────────────────────────────
// Soft delete de un profesional
router.delete('/:id', async (req, res) => {
    const deleted = await deleteProfesional(parseInt(req.params.id));
    if (!deleted) {
        return res.status(404).json({ error: 'Profesional no encontrado' });
    }
    res.json({ success: true, mensaje: 'Profesional eliminado correctamente' });
});

module.exports = router;
