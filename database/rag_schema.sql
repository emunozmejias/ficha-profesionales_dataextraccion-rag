-- ============================================================
-- RAG - Índice vectorial para búsqueda en lenguaje natural
-- Requiere: PostgreSQL 16 + extensión pgvector
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TABLA: documento_rag
-- Un registro por cada PDF indexado (ID único por documento)
-- ============================================================
CREATE TABLE IF NOT EXISTS documento_rag (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profesional_id      INT NOT NULL REFERENCES profesional(id) ON DELETE CASCADE,
    archivo_cv          VARCHAR(300) NOT NULL,
    profesional_nombre  VARCHAR(150) NOT NULL,
    fecha_indexado      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE documento_rag IS 'Documentos PDF indexados para RAG; uno por CV cargado';
CREATE INDEX IF NOT EXISTS idx_documento_rag_profesional ON documento_rag(profesional_id);

-- ============================================================
-- TABLA: documento_rag_chunk
-- Fragmentos de contenido con su embedding (vector)
-- Dimensión 1536 = OpenAI text-embedding-3-small
-- ============================================================
CREATE TABLE IF NOT EXISTS documento_rag_chunk (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_rag_id UUID NOT NULL REFERENCES documento_rag(id) ON DELETE CASCADE,
    contenido       TEXT NOT NULL,
    embedding       vector(1536)
);

COMMENT ON TABLE documento_rag_chunk IS 'Chunks de cada CV con embedding para búsqueda por similitud';
CREATE INDEX IF NOT EXISTS idx_rag_chunk_documento ON documento_rag_chunk(documento_rag_id);

-- Índice para búsqueda por similitud (ivfflat o hnsw)
CREATE INDEX IF NOT EXISTS idx_rag_chunk_embedding ON documento_rag_chunk
    USING hnsw (embedding vector_cosine_ops);
