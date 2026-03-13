# PostgreSQL 16 con extensión pgvector para RAG
FROM pgvector/pgvector:pg16

# Scripts de inicialización (orden: 01 antes que 02)
COPY schema.sql      /docker-entrypoint-initdb.d/01_schema.sql
COPY rag_schema.sql  /docker-entrypoint-initdb.d/02_rag_schema.sql
