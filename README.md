# 🗂️ Ficha de Profesionales

Sistema para RR.HH. que carga CVs en PDF, extrae datos automáticamente con IA (Claude de Anthropic) y los almacena en PostgreSQL para su consulta, búsqueda por skills y **búsqueda en lenguaje natural (RAG)**. Incluye edición de fichas y sincronización del índice vectorial.

---

## 📁 Estructura del Proyecto

```
ficha-profesionales/
├── database/
│   ├── schema.sql          ← DDL principal (tablas, vistas, función buscar_por_skills)
│   └── rag_schema.sql      ← Extensión pgvector y tablas para RAG (opcional)
├── backend/
│   ├── .env.example        ← Plantilla de variables de entorno
│   ├── package.json
│   └── src/
│       ├── server.js           ← Servidor Express
│       ├── config/
│       │   └── database.js     ← Conexión PostgreSQL
│       ├── routes/
│       │   ├── profesionales.js ← CRUD, cargar CV, buscar por skills
│       │   └── rag.js           ← Búsqueda en lenguaje natural
│       ├── services/
│       │   ├── claudeService.js      ← Extracción IA con Claude
│       │   ├── localExtractionService.js ← Alternativa con Ollama
│       │   ├── dbService.js           ← Operaciones en BD
│       │   ├── embeddingService.js    ← Embeddings OpenAI (RAG)
│       │   └── ragService.js          ← Indexación y búsqueda RAG
│       └── scripts/
│           ├── initDb.js        ← Inicializa BD con schema.sql
│           ├── reindexRag.js    ← Reindexa CVs en RAG
│           └── extractPdfText.js
└── frontend/
    ├── package.json
    └── src/
        ├── App.js
        ├── index.css
        ├── services/api.js
        ├── components/
        │   ├── CargarCV.jsx
        │   └── DetalleProfesional.jsx
        └── pages/
            ├── Dashboard.jsx
            ├── Profesionales.jsx
            ├── EditarProfesional.jsx
            └── BusquedaIA.jsx
```

---

## ⚙️ Requisitos Previos

- **Node.js** v18 o superior (recomendado v20 con nvm)
- **PostgreSQL 16** instalado y en ejecución (con extensión pgvector si usas RAG)
- **Cuenta en Anthropic** con API Key (https://console.anthropic.com) para extracción de CV y respuesta RAG
- **OpenAI API Key** (https://platform.openai.com) opcional, solo si usas Búsqueda IA (RAG)

---

## 🗄️ Instalación de la Base de Datos

### Paso 1: Crear la base de datos

Conéctate a PostgreSQL (como superusuario o usuario con permisos de creación) y crea la base:

```bash
psql -U postgres
```

Dentro de `psql`:

```sql
CREATE DATABASE ficha_profesionales;
\c ficha_profesionales
```

O en una sola línea desde la terminal:

```bash
psql -U postgres -c "CREATE DATABASE ficha_profesionales;"
```

### Paso 2: Ejecutar el schema principal

El schema principal crea tablas, vistas, la función `buscar_por_skills` y datos semilla de skills.

**Opción A — Desde el backend con el script incluido (recomendado):**

Primero configura el `.env` del backend (ver sección Backend más abajo) con `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. Luego:

```bash
cd backend
npm install
npm run db:init
```

El script `db:init` ejecuta `database/schema.sql` usando la ruta del proyecto (debe ejecutarse desde la carpeta `backend/`).

**Opción B — Manualmente con psql:**

Desde la raíz del proyecto:

```bash
psql -U postgres -d ficha_profesionales -f database/schema.sql
```

Sustituye `postgres` por tu usuario y `ficha_profesionales` por el nombre de tu base si es distinto.

### Paso 3: Schema RAG (solo si usarás Búsqueda IA)

Para habilitar la búsqueda en lenguaje natural necesitas la extensión **pgvector** y las tablas `documento_rag` y `documento_rag_chunk`. Ejecuta:

```bash
psql -U postgres -d ficha_profesionales -f database/rag_schema.sql
```

Si tu instalación de PostgreSQL no tiene pgvector, instálala antes (en muchas distribuciones: `apt install postgresql-16-pgvector` o equivalente).

### Resumen de comandos BD

| Acción              | Comando (desde raíz del proyecto) |
|---------------------|-----------------------------------|
| Crear BD            | `psql -U postgres -c "CREATE DATABASE ficha_profesionales;"` |
| Schema principal    | `psql -U postgres -d ficha_profesionales -f database/schema.sql` |
| Schema RAG          | `psql -U postgres -d ficha_profesionales -f database/rag_schema.sql` |
| Inicializar vía backend | `cd backend && npm run db:init` (requiere .env configurado) |

---

## ⚙️ Instalación y ejecución del Backend

### 1. Entrar en la carpeta e instalar dependencias

```bash
cd backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y ajusta al menos:

```env
# Base de datos (debe coincidir con la BD que creaste)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ficha_profesionales
DB_USER=postgres
DB_PASSWORD=tu_password_aqui

# Anthropic (obligatorio para extracción de CV y respuesta RAG)
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=4000

# Servidor
PORT=3001
NODE_ENV=development
UPLOADS_PATH=./uploads
CORS_ORIGIN=http://localhost:3000
```

Opcional (Búsqueda IA):

```env
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
RAG_TOP_K=5
```

Opcional (extracción local con Ollama en lugar de Claude):

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### 3. Inicializar la BD (si no lo hiciste antes)

```bash
npm run db:init
```

Esto ejecuta `database/schema.sql`. Si quieres RAG, ejecuta además `database/rag_schema.sql` como se indicó arriba.

### 4. Ejecutar el backend

**Desarrollo (recarga automática con nodemon):**

```bash
npm run dev
```

**Producción:**

```bash
npm start
```

El servidor queda en **http://localhost:3001**. Comprueba con:

```bash
curl http://localhost:3001/api/health
```

---

## ⚙️ Instalación y ejecución del Frontend

### 1. Entrar en la carpeta e instalar dependencias

```bash
cd frontend
npm install
```

### 2. Configurar la URL del API (opcional)

Por defecto el frontend usa `http://localhost:3001/api`. Si tu backend está en otro host o puerto, crea un archivo `.env` en la carpeta `frontend/`:

```env
REACT_APP_API_URL=http://localhost:3001/api
```

### 3. Ejecutar el frontend

```bash
npm start
```

La aplicación React se abre en **http://localhost:3000** (el navegador puede abrirse solo). Para producción puedes generar la build:

```bash
npm run build
```

---

## 🔑 Cómo obtener las API Keys

### Anthropic (Claude)

1. Entra en **https://console.anthropic.com**
2. Crea una cuenta o inicia sesión
3. Menú **API Keys** → **Create Key**
4. Copia la clave (solo se muestra una vez) y pégala en `.env` como `ANTHROPIC_API_KEY`

> La clave suele comenzar con `sk-ant-api03-...`. No subas `.env` a Git.

### OpenAI (solo para Búsqueda IA / RAG)

1. Entra en **https://platform.openai.com/api-keys**
2. Crea una API Key y cópiala
3. En el backend `.env` define `OPENAI_API_KEY=sk-...`

---

## 📡 Endpoints del API

| Método   | Ruta                                    | Descripción |
|----------|-----------------------------------------|-------------|
| `POST`   | `/api/profesionales/cargar-cv`          | Sube PDF, extrae con IA y guarda en BD (e indexa RAG si hay OPENAI_API_KEY) |
| `GET`    | `/api/profesionales`                    | Lista profesionales (paginación + búsqueda por texto) |
| `GET`    | `/api/profesionales/:id`                | Detalle completo de un profesional |
| `PUT`    | `/api/profesionales/:id`                | Actualiza ficha; reindexa RAG si está configurado |
| `GET`    | `/api/profesionales/:id/cv`              | Descarga el PDF original del CV |
| `GET`    | `/api/profesionales/skills`              | Catálogo de skills |
| `GET`    | `/api/profesionales/buscar-por-skills`  | Filtra por skills: `?skills=Java,Angular` |
| `DELETE`| `/api/profesionales/:id`                 | Elimina (soft delete) un profesional |
| `POST`   | `/api/rag/buscar`                       | Búsqueda en lenguaje natural (body: `{ "query": "..." }`) |
| `GET`    | `/api/health`                           | Estado del servidor |

---

## 🗄️ Esquema de la Base de Datos

**Tablas principales:**  
`profesional` → `profesional_educacion`, `profesional_certificacion`, `profesional_skill` ↔ `skill`, `experiencia_laboral` → `experiencia_skill` ↔ `skill`.

**Vista:** `vista_profesional_resumen`.  
**Función:** `buscar_por_skills(TEXT[])` — profesionales que tienen **todas** las skills indicadas.

**RAG (opcional):** `documento_rag` (un registro por CV indexado), `documento_rag_chunk` (fragmentos con columna `embedding vector(1536)`). Requiere extensión `vector` (pgvector).

---

## 🏗️ Tecnologías Utilizadas

| Capa          | Tecnología |
|---------------|------------|
| IA / extracción | Claude API (Anthropic) u Ollama (local) |
| IA / RAG      | OpenAI (embeddings), Claude (respuesta en lenguaje natural) |
| Backend       | Node.js, Express, Multer, pg, pgvector |
| Base de datos | PostgreSQL 16, pgvector |
| Frontend      | React 18, Axios |

---

## 📌 Notas Importantes

- Los PDFs se guardan en `backend/uploads/` con timestamp en el nombre.
- La extracción de un CV puede tardar varios segundos; la carga en BD es transaccional (todo o nada).
- Si actualizas la función `buscar_por_skills` en el código, debes volver a ejecutar su `CREATE OR REPLACE FUNCTION` en la BD (desde `schema.sql` o el bloque correspondiente).
- Para reindexar solo profesionales que aún no están en RAG: `cd backend && node scripts/reindexRag.js` (requiere `OPENAI_API_KEY`).
- No subas el archivo `.env` a Git; usa `.env.example` como referencia.
