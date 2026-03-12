-- ============================================================
-- FICHA DE PROFESIONALES - Schema PostgreSQL 16
-- ============================================================

-- Extensiones útiles
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- TABLA: profesional
-- ============================================================
CREATE TABLE IF NOT EXISTS profesional (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(150)    NOT NULL,
    rut             VARCHAR(20)     UNIQUE,
    email           VARCHAR(150),
    telefono        VARCHAR(30),
    ciudad          VARCHAR(100),
    resumen         TEXT,
    archivo_cv      VARCHAR(300),
    fecha_carga     TIMESTAMP       DEFAULT NOW(),
    activo          BOOLEAN         DEFAULT TRUE
);

COMMENT ON TABLE  profesional              IS 'Tabla principal con datos personales del profesional';
COMMENT ON COLUMN profesional.archivo_cv   IS 'Nombre del archivo PDF almacenado en el sistema de archivos local';
COMMENT ON COLUMN profesional.fecha_carga  IS 'Fecha en que fue cargado el CV al sistema';

-- ============================================================
-- TABLA: profesional_educacion
-- ============================================================
CREATE TABLE IF NOT EXISTS profesional_educacion (
    id              SERIAL PRIMARY KEY,
    profesional_id  INT             NOT NULL REFERENCES profesional(id) ON DELETE CASCADE,
    institucion     VARCHAR(200)    NOT NULL,
    titulo          VARCHAR(200)    NOT NULL,
    anio_egreso     SMALLINT,
    nivel           VARCHAR(50)     CHECK (nivel IN ('Ingeniería','Técnico','Postgrado','Diplomado','Certificación','Otro'))
);

COMMENT ON TABLE profesional_educacion IS 'Formación académica formal del profesional';

-- ============================================================
-- TABLA: profesional_certificacion
-- ============================================================
CREATE TABLE IF NOT EXISTS profesional_certificacion (
    id              SERIAL PRIMARY KEY,
    profesional_id  INT             NOT NULL REFERENCES profesional(id) ON DELETE CASCADE,
    nombre          VARCHAR(250)    NOT NULL,
    institucion     VARCHAR(200),
    anio            SMALLINT,
    estado          VARCHAR(30)     DEFAULT 'completado' CHECK (estado IN ('completado','en_curso'))
);

COMMENT ON TABLE profesional_certificacion IS 'Cursos, diplomados y certificaciones adicionales';

-- ============================================================
-- TABLA: skill  (catálogo maestro)
-- ============================================================
CREATE TABLE IF NOT EXISTS skill (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100)    NOT NULL UNIQUE,
    categoria       VARCHAR(80)     CHECK (categoria IN (
                        'lenguaje','framework','base_datos',
                        'cloud','devops','metodologia','herramienta','otro'
                    ))
);

COMMENT ON TABLE  skill           IS 'Catálogo maestro normalizado de skills y tecnologías';
COMMENT ON COLUMN skill.categoria IS 'Categoría técnica: lenguaje, framework, base_datos, cloud, devops, metodologia, herramienta, otro';

-- ============================================================
-- TABLA: profesional_skill  (skills globales del profesional)
-- ============================================================
CREATE TABLE IF NOT EXISTS profesional_skill (
    id              SERIAL PRIMARY KEY,
    profesional_id  INT             NOT NULL REFERENCES profesional(id) ON DELETE CASCADE,
    skill_id        INT             NOT NULL REFERENCES skill(id),
    nivel           VARCHAR(30)     DEFAULT NULL CHECK (nivel IN ('básico','intermedio','avanzado') OR nivel IS NULL),
    UNIQUE (profesional_id, skill_id)
);

COMMENT ON TABLE profesional_skill IS 'Relación entre profesional y sus skills generales declaradas en el CV';

-- ============================================================
-- TABLA: experiencia_laboral
-- ============================================================
CREATE TABLE IF NOT EXISTS experiencia_laboral (
    id              SERIAL PRIMARY KEY,
    profesional_id  INT             NOT NULL REFERENCES profesional(id) ON DELETE CASCADE,
    empresa         VARCHAR(200)    NOT NULL,
    cargo           VARCHAR(200)    NOT NULL,
    fecha_inicio    DATE,
    fecha_fin       DATE,
    es_actual       BOOLEAN         DEFAULT FALSE,
    descripcion     TEXT,
    CONSTRAINT chk_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

COMMENT ON TABLE  experiencia_laboral          IS 'Historial de empleos del profesional';
COMMENT ON COLUMN experiencia_laboral.es_actual IS 'TRUE si es el trabajo actual (fecha_fin debe ser NULL)';

-- ============================================================
-- TABLA: experiencia_skill  (skills usadas en cada experiencia)
-- ============================================================
CREATE TABLE IF NOT EXISTS experiencia_skill (
    id                      SERIAL PRIMARY KEY,
    experiencia_laboral_id  INT     NOT NULL REFERENCES experiencia_laboral(id) ON DELETE CASCADE,
    skill_id                INT     NOT NULL REFERENCES skill(id),
    UNIQUE (experiencia_laboral_id, skill_id)
);

COMMENT ON TABLE experiencia_skill IS 'Skills/tecnologías usadas en cada posición laboral específica';

-- ============================================================
-- ÍNDICES para optimizar búsquedas frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profesional_nombre       ON profesional           USING gin(to_tsvector('spanish', nombre));
CREATE INDEX IF NOT EXISTS idx_profesional_activo       ON profesional           (activo);
CREATE INDEX IF NOT EXISTS idx_prof_skill_skill_id      ON profesional_skill     (skill_id);
CREATE INDEX IF NOT EXISTS idx_prof_skill_prof_id       ON profesional_skill     (profesional_id);
CREATE INDEX IF NOT EXISTS idx_exp_skill_skill_id       ON experiencia_skill     (skill_id);
CREATE INDEX IF NOT EXISTS idx_exp_laboral_prof_id      ON experiencia_laboral   (profesional_id);
CREATE INDEX IF NOT EXISTS idx_skill_nombre_trgm        ON skill                 USING gin(nombre gin_trgm_ops);

-- ============================================================
-- VISTA: vista_profesional_completo
-- Facilita consultas del frontend sin múltiples JOINs
-- ============================================================
CREATE OR REPLACE VIEW vista_profesional_resumen AS
SELECT
    p.id,
    p.nombre,
    p.rut,
    p.email,
    p.telefono,
    p.ciudad,
    p.resumen,
    p.archivo_cv,
    p.fecha_carga,
    p.activo,
    -- Skills como array
    COALESCE(
        array_agg(DISTINCT s.nombre) FILTER (WHERE s.nombre IS NOT NULL),
        ARRAY[]::VARCHAR[]
    ) AS skills,
    -- Cantidad de experiencias
    COUNT(DISTINCT el.id) AS num_experiencias,
    -- Empresa más reciente
    (
        SELECT el2.empresa
        FROM experiencia_laboral el2
        WHERE el2.profesional_id = p.id
        ORDER BY COALESCE(el2.fecha_fin, CURRENT_DATE) DESC
        LIMIT 1
    ) AS ultima_empresa,
    -- Cargo más reciente
    (
        SELECT el2.cargo
        FROM experiencia_laboral el2
        WHERE el2.profesional_id = p.id
        ORDER BY COALESCE(el2.fecha_fin, CURRENT_DATE) DESC
        LIMIT 1
    ) AS ultimo_cargo
FROM profesional p
LEFT JOIN profesional_skill ps ON ps.profesional_id = p.id
LEFT JOIN skill s               ON s.id = ps.skill_id
LEFT JOIN experiencia_laboral el ON el.profesional_id = p.id
WHERE p.activo = TRUE
GROUP BY p.id;

-- ============================================================
-- FUNCIÓN: buscar_profesionales_por_skills
-- Retorna profesionales que poseen TODAS las skills indicadas
-- ============================================================
CREATE OR REPLACE FUNCTION buscar_por_skills(skills_buscadas TEXT[])
RETURNS TABLE (
    profesional_id  INT,
    nombre          VARCHAR,
    email           VARCHAR,
    ciudad          VARCHAR,
    skills_match    TEXT[],
    num_experiencias BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.nombre,
        p.email,
        p.ciudad,
        array_agg(DISTINCT s.nombre)::TEXT[] AS skills_match,
        COUNT(DISTINCT el.id) AS num_experiencias
    FROM profesional p
    JOIN profesional_skill ps ON ps.profesional_id = p.id
    JOIN skill s               ON s.id = ps.skill_id
    LEFT JOIN experiencia_laboral el ON el.profesional_id = p.id
    WHERE unaccent(LOWER(s.nombre)) = ANY(
        SELECT unaccent(LOWER(x)) FROM unnest(skills_buscadas) x
    )
    AND p.activo = TRUE
    GROUP BY p.id
    HAVING COUNT(DISTINCT unaccent(LOWER(s.nombre))) = (
        SELECT COUNT(DISTINCT unaccent(LOWER(x))) FROM unnest(skills_buscadas) x
    )
    ORDER BY num_experiencias DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DATOS SEMILLA: categorías de skills comunes
-- ============================================================
INSERT INTO skill (nombre, categoria) VALUES
    ('Java',          'lenguaje'),
    ('JavaScript',    'lenguaje'),
    ('TypeScript',    'lenguaje'),
    ('Python',        'lenguaje'),
    ('SQL',           'lenguaje'),
    ('PL/SQL',        'lenguaje'),
    ('C#',            'lenguaje'),
    ('Angular',       'framework'),
    ('React',         'framework'),
    ('Spring Boot',   'framework'),
    ('Node.js',       'framework'),
    ('NestJS',        'framework'),
    ('Docker',        'devops'),
    ('Kubernetes',    'devops'),
    ('Jenkins',       'devops'),
    ('Git',           'devops'),
    ('AWS',           'cloud'),
    ('GCP',           'cloud'),
    ('Azure',         'cloud'),
    ('PostgreSQL',    'base_datos'),
    ('MongoDB',       'base_datos'),
    ('Oracle',        'base_datos'),
    ('SQL Server',    'base_datos'),
    ('Scrum',         'metodologia'),
    ('Jira',          'herramienta')
ON CONFLICT (nombre) DO NOTHING;
