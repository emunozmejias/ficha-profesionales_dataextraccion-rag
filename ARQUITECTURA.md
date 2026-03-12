# ARQUITECTURA — Ficha de Profesionales

## 1. Propósito del sistema

**Ficha de Profesionales** es una aplicación que automatiza la carga de currículums vitae (CV) en formato PDF a una base de datos relacional usando **IA generativa**. Está pensada para equipos de RR.HH. o reclutamiento que reciben muchos CVs y necesitan:

- **Eliminar la carga manual**: no copiar a mano datos desde cada PDF.
- **Estandarizar la información**: nombres, fechas, skills y experiencias en un formato estructurado.
- **Permitir búsquedas avanzadas**: por skills, empresa, cargo, etc., sobre datos ya normalizados.
- **Centralizar los CVs**: el PDF original se guarda y se asocia al profesional para descarga posterior.
- **Búsqueda en lenguaje natural (Búsqueda IA)**: consultas en texto libre sobre el contenido de todos los CVs; la respuesta indica de qué PDF y profesional proviene la información (RAG con vectores en PostgreSQL).

El sistema **lee el contenido del PDF**, extrae con IA los datos relevantes (datos personales, educación, certificaciones, experiencia laboral y habilidades técnicas), y los **persiste en PostgreSQL** en tablas relacionales y, opcionalmente, en un **índice vectorial** (RAG) para búsqueda en lenguaje natural.

---

## 2. Descripción de componentes

### 2.1 Frontend (React)

- **Tecnología**: React 18 con Create React App.
- **Función**: Interfaz de usuario para:
  - Subir archivos PDF (arrastrar o seleccionar).
  - Listar profesionales con paginación y búsqueda por texto.
  - Ver detalle de un profesional (datos, educación, experiencias, skills).
  - Buscar por skills (ej.: Java, Angular, Docker).
  - **Búsqueda IA**: consulta en lenguaje natural sobre el contenido de los CVs; muestra la respuesta y las fuentes (archivo PDF y nombre del profesional), con enlace a la ficha del profesional.
  - Descargar el PDF original del CV.
  - Eliminar (soft delete) un profesional.
- **Comunicación**: Llama al backend vía HTTP (Axios) a `http://localhost:3001/api`. Timeout de 2 minutos para la carga de CV y para la Búsqueda IA.

### 2.2 Backend (Node.js + Express)

- **Tecnología**: Node.js, Express, middlewares CORS, Multer (subida de archivos), cliente PostgreSQL (`pg`).
- **Función**:
  - Recibir el PDF por `POST /api/profesionales/cargar-cv`.
  - Guardar el archivo en disco (carpeta `uploads`).
  - Invocar el servicio de IA (Claude u Ollama) para extraer datos del PDF.
  - Recibir el JSON estructurado y persistirlo en la base de datos en una transacción.
  - Tras guardar el CV, indexar su contenido en el índice RAG (embeddings con OpenAI) si está configurado.
  - Exponer endpoints REST para listar, buscar, obtener detalle, descargar CV, eliminar y **RAG**: `POST /api/rag/buscar` para búsqueda en lenguaje natural.
- **Configuración**: Variables de entorno (`.env`) para BD, Anthropic, OpenAI (embeddings), Ollama (opcional), puerto, rutas de uploads, CORS, etc.

### 2.3 Servicio de IA para extracción de CV (Claude / Anthropic u Ollama)

- **Tecnología**: Anthropic (`@anthropic-ai/sdk`) o, en modo local, Ollama (modelo p. ej. llama3.2) con texto extraído del PDF vía `pdf-parse`.
- **Función**: Recibe el PDF (o su texto) y un prompt en español que define la estructura JSON de salida. El modelo analiza el documento y devuelve un único objeto JSON con: profesional, educación, certificaciones, experiencias (con skills por experiencia) y skills generales. El prompt incluye reglas de normalización de tecnologías y categorías de skills.

### 2.4 Servicios para RAG (Búsqueda IA)

- **Embedding (OpenAI)**: `embeddingService.js` usa la API de OpenAI (`text-embedding-3-small`, 1536 dimensiones) para convertir texto en vectores. Se usa al indexar cada CV (fragmentos por sección) y al convertir la consulta del usuario en vector. Anthropic no ofrece API de embeddings; por eso se usa OpenAI solo para esta parte.
- **RAG (ragService.js)**: Construye fragmentos de texto a partir del JSON del CV, obtiene sus embeddings, los almacena en `documento_rag_chunk`. En la búsqueda: embede la consulta, recupera los fragmentos más similares en PostgreSQL (pgvector), arma un prompt con ese contexto y llama a **Anthropic (Claude)** para generar la respuesta en lenguaje natural. Devuelve la respuesta y las fuentes (archivo PDF y nombre del profesional).

### 2.5 Base de datos (PostgreSQL)

- **Versión objetivo**: PostgreSQL 16 (compatible con versiones recientes).
- **Función**: Almacenar de forma relacional:
  - **profesional**: datos personales y referencia al archivo PDF.
  - **profesional_educacion**, **profesional_certificacion**: formación y certificaciones.
  - **skill**: catálogo maestro de tecnologías/habilidades (evita duplicados y permite búsquedas consistentes).
  - **profesional_skill**: relación N:M entre profesional y skills generales.
  - **experiencia_laboral**: empleos con empresa, cargo, fechas, descripción.
  - **experiencia_skill**: skills asociadas a cada experiencia.
- **RAG (pgvector)**: Extensión `vector`. Tabla **documento_rag**: un registro por CV indexado (id UUID, profesional_id, archivo_cv, profesional_nombre). Tabla **documento_rag_chunk**: fragmentos de texto con columna `embedding vector(1536)` para búsqueda por similitud coseno. Índice HNSW sobre `embedding` para consultas rápidas.
- **Extras**: Extensiones `unaccent` y `pg_trgm` para búsquedas; vista `vista_profesional_resumen`; función `buscar_por_skills(skills_buscadas TEXT[])`; índices para rendimiento.

---

## 3. Arquitectura general

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    NAVEGADOR (Usuario)                   │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │ HTTP (REST)
                    ┌─────────────────────────────▼───────────────────────────┐
                    │              FRONTEND (React - puerto 3000)              │
                    │  Cargar CV · Listar/buscar · Detalle · Buscar por Skills  │
                    │  Búsqueda IA (leng. natural) · Descargar CV · Eliminar   │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │
                    ┌─────────────────────────────▼───────────────────────────┐
                    │            BACKEND (Express - puerto 3001)               │
                    │  /api/profesionales/*  ·  /api/rag/buscar  ·  /api/health │
                    │  Multer: ./uploads                                         │
                    └──┬──────────────┬──────────────┬──────────────────────┬──┘
                       │              │              │                      │
        ┌──────────────▼──┐  ┌────────▼────────┐  ┌─▼─────────────┐  ┌─────▼─────┐
        │ Claude/Ollama   │  │ dbService      │  │ embeddingService│  │ ragService│
        │ (extracción CV) │  │ Transacción BD │  │ OpenAI: texto  │  │ Indexar +  │
        │ PDF → JSON      │  │ profesional +  │  │ → vector 1536  │  │ buscar +   │
        └────────┬────────┘  │ educ, exp, etc│  └───────┬────────┘  │ Claude    │
                 │           └───────┬────────┘          │           │ (respuesta)│
                 │                   │                   │           └─────┬─────┘
                 │                   │                   │                 │
        ┌────────▼────────┐  ┌───────▼───────────────────▼─────────────────▼─────┐
        │ ANTHROPIC /     │  │ OPENAI (solo embeddings)  │  PostgreSQL 16        │
        │ OLLAMA (local)  │  │ text-embedding-3-small    │  Tablas relacionales  │
        │ Extracción PDF  │  │                           │  + pgvector (RAG)     │
        └─────────────────┘  └──────────────────────────┴──────────────────────┘
```

Flujo resumido para **carga de un CV**:

1. Usuario sube PDF desde el frontend.
2. Backend recibe el archivo (Multer), lo guarda en `uploads`.
3. Backend lee el PDF, lo codifica en base64 y lo envía a Claude con el prompt de extracción.
4. Claude devuelve texto; el backend lo parsea como JSON y valida que exista `profesional.nombre`.
5. Backend abre una transacción en PostgreSQL e inserta en orden: profesional → educación → certificaciones → skills (upsert en catálogo + profesional_skill) → experiencias → experiencia_skill (y vincula skills de cada experiencia al profesional cuando aplica).
6. Si todo va bien: COMMIT y respuesta 201 al frontend. Si hay error: ROLLBACK y, en caso de fallo en procesamiento, se puede eliminar el PDF recién subido.
7. Si está configurado `OPENAI_API_KEY`, se indexa el CV para RAG: se generan fragmentos del JSON, se obtienen embeddings (OpenAI) y se guardan en `documento_rag` y `documento_rag_chunk`.

Flujo resumido para **Búsqueda IA** (RAG):

1. Usuario escribe una pregunta en lenguaje natural en la sección "Búsqueda IA" del frontend.
2. Frontend envía `POST /api/rag/buscar` con `{ query: "..." }`.
3. Backend (ragService): obtiene el embedding de la consulta con OpenAI.
4. Backend consulta PostgreSQL (pgvector): busca los fragmentos más similares (distancia coseno) en `documento_rag_chunk`, uniendo con `documento_rag` y filtrando por profesionales activos.
5. Backend arma un prompt con esos fragmentos y envía el contexto a **Anthropic (Claude)** para que genere una respuesta en lenguaje natural.
6. Backend devuelve `{ answer, sources }` donde `sources` son los PDF y nombres de profesionales de donde salió la información.
7. Frontend muestra la respuesta y la lista de fuentes (archivo PDF, nombre del profesional, enlace "Ver ficha").

---

## 4. Búsqueda IA (RAG): descripción detallada

La **Búsqueda IA** permite consultar en lenguaje natural el contenido de todos los CVs indexados (por ejemplo: "¿Quién tiene experiencia con React y Node?", "¿Quién trabajó en el sector bancario?"). La respuesta se construye con **RAG** (Retrieval Augmented Generation):

1. **Indexación** (al cargar un CV o con el script de reindexación): El JSON extraído del CV se divide en fragmentos por sección (datos del profesional, educación, cada experiencia, skills). Cada fragmento se convierte en un vector de 1536 dimensiones con la API de **OpenAI** (`text-embedding-3-small`) y se guarda en `documento_rag_chunk` junto con la referencia al documento (`documento_rag`: profesional_id, archivo_cv, profesional_nombre). Cada PDF tiene un único `documento_rag.id` (UUID).

2. **Consulta**: El usuario escribe una pregunta. Esa pregunta se convierte en un vector con la misma API de OpenAI. En PostgreSQL se hace una búsqueda por similitud (operador `<=>` sobre la columna `embedding`) y se recuperan los fragmentos más cercanos (por defecto los 5 mejores, `RAG_TOP_K`).

3. **Generación de la respuesta**: Los fragmentos recuperados (y los metadatos de fuente: archivo PDF, nombre del profesional) se envían a **Anthropic (Claude)** como contexto. Claude genera una respuesta en lenguaje natural basada solo en ese contexto. La respuesta se devuelve junto con la lista de fuentes (archivo_cv, profesional_nombre, profesional_id) para que el usuario sepa de qué CV proviene la información.

**Por qué dos APIs en RAG:** Anthropic no ofrece un API público de embeddings (vectores). Para la búsqueda por similitud es necesario representar texto como vectores; por eso se usa **OpenAI** solo para esa parte. La redacción de la respuesta final se hace con **Claude (Anthropic)** para mantener un único proveedor de lenguaje natural en el proyecto (extracción de CV y respuesta RAG).

---

## 5. Lenguajes y frameworks utilizados

| Capa        | Lenguaje / stack        | Frameworks y librerías principales                          |
|------------|--------------------------|-------------------------------------------------------------|
| Frontend   | JavaScript (ES6+)       | React 18, react-scripts (CRA), Axios                        |
| Backend    | Node.js (JavaScript)    | Express, Multer, pg, dotenv, express-async-errors, cors     |
| IA / RAG   | Uso de APIs externas    | @anthropic-ai/sdk (Claude), openai (embeddings), pgvector   |
| Base de datos | SQL (PostgreSQL 16)  | pg (driver), unaccent, pg_trgm, vector (pgvector)           |

- **Runtime**: Node.js v18+ (recomendado v20 con nvm).
- **Gestor de paquetes**: npm.
- **Control de versiones**: Git (repositorio del proyecto).

---

## 6. Resumen de APIs y uso en el proyecto

| API / servicio   | Uso en el proyecto | Endpoint / modelo típico |
|------------------|--------------------|---------------------------|
| **Anthropic (Claude)** | 1) Extracción de datos del PDF: el backend envía el PDF (o su texto) y un prompt; Claude devuelve el JSON estructurado del CV. 2) Búsqueda IA: con los fragmentos recuperados del RAG, Claude genera la respuesta en lenguaje natural. | `POST https://api.anthropic.com/v1/messages`. Modelos: `CLAUDE_MODEL` (extracción), `CLAUDE_MODEL` / Sonnet (RAG). |
| **OpenAI**       | Solo **embeddings**: convertir fragmentos de texto del CV y la consulta del usuario en vectores (1536 dim.) para almacenar en pgvector y buscar por similitud. No se usa para generar texto. | API de embeddings (p. ej. `text-embedding-3-small`). Variable: `OPENAI_API_KEY`. |
| **Ollama (opcional)** | Alternativa local a Anthropic para la **extracción** del CV: el backend extrae el texto del PDF con `pdf-parse` y envía ese texto a un modelo local (p. ej. llama3.2); el modelo devuelve el mismo JSON. No interviene en RAG. | `POST http://localhost:11434/api/chat`. Variables: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`. |

En resumen: **OpenAI** solo para vectores (RAG); **Anthropic** para extracción del PDF y para la respuesta de la Búsqueda IA; **Ollama** solo como reemplazo opcional de Anthropic en la extracción del CV.

---

## 7. Proceso detallado: carga de PDF, procesamiento con IA, JSON y carga en BD

**Endpoint REST del backend (base):** `http://localhost:3001` (configurable con `PORT` en `.env`; por defecto 3001).

---

### 7.1 Recepción y almacenamiento del PDF

**Endpoint REST utilizado:**

- **Backend:** `POST http://localhost:3001/api/profesionales/cargar-cv`

1. El usuario selecciona o arrastra un archivo PDF en el componente de carga del frontend.
2. El frontend envía una petición **POST** al endpoint anterior con el body en `multipart/form-data` y el archivo en el campo **`cv`**.
3. En el backend, **Multer** (middleware que atiende ese endpoint):
   - Valida que el contenido sea `application/pdf`.
   - Verifica que el tamaño no supere `MAX_FILE_SIZE` (por defecto 10 MB).
   - Guarda el archivo en la ruta configurada (`UPLOADS_PATH`, por defecto `./uploads`) con un nombre único: `{timestamp}_{nombre_original_sanitizado}`.
4. Se obtienen la ruta absoluta del archivo (`filePath`) y el nombre guardado (`fileName`) para usarlos en el siguiente paso y, en caso de éxito, para registrar `archivo_cv` en la tabla `profesional`.

---

### 7.2 Procesamiento con IA (Claude)

**Endpoint REST utilizado:**

- **API de Anthropic:** `POST https://api.anthropic.com/v1/messages`  
  (El backend usa el SDK `@anthropic-ai/sdk`, que internamente llama a este endpoint con headers `x-api-key`, `anthropic-version`, `content-type: application/json`.)

1. **Lectura del PDF**: El backend lee el archivo desde disco y lo convierte a **base64** (la API de Anthropic acepta documentos en base64 con `media_type: application/pdf`).
2. **Construcción del mensaje**: Se arma un mensaje de usuario con:
   - Un bloque de tipo `document` (PDF en base64).
   - Un bloque de tipo `text` con el **prompt de extracción** (`EXTRACTION_PROMPT` en `claudeService.js`). El prompt indica que la respuesta debe ser **únicamente un objeto JSON válido**, sin markdown ni texto adicional, y define la estructura exacta esperada.
3. **Llamada a la API**: El backend llama a `client.messages.create()` (SDK), que realiza **POST** a `https://api.anthropic.com/v1/messages` con:
   - `model`: valor de `CLAUDE_MODEL` (ej. `claude-opus-4-5`).
   - `max_tokens`: valor de `CLAUDE_MAX_TOKENS` (ej. 4000).
   - `messages`: el array con el usuario (documento + prompt).
4. **Respuesta**: Claude devuelve uno o más bloques de contenido. El servicio toma todos los bloques de tipo `text`, concatena su contenido y lo considera la salida en bruto.
5. **Parseo del JSON**: Se intenta `JSON.parse(rawText)`. Si falla (por ejemplo por texto extra alrededor), se busca la primera ocurrencia de `{ ... }` con una expresión regular y se parsea ese fragmento.
6. **Validación básica**: Se comprueba que exista `cvData.profesional` y `cvData.profesional.nombre`. Si no, se lanza error.
7. **Normalización de arrays**: Se asegura que `educacion`, `certificaciones`, `experiencias` y `skills_generales` existan como arrays (si Claude no los incluye, se usan `[]`).

En caso de error en cualquier paso anterior, se propaga la excepción; el route puede eliminar el PDF subido y responder con 500 al cliente que llamó a **POST** `http://localhost:3001/api/profesionales/cargar-cv`.

### 7.3 Estructura del JSON devuelto por el procesamiento

El JSON que el backend espera proviene del **cuerpo de la respuesta** del endpoint de Anthropic **POST https://api.anthropic.com/v1/messages** (en los bloques de contenido de tipo `text`). El backend parsea ese texto y espera (según el prompt enviado a Claude) la siguiente estructura:

```json
{
  "profesional": {
    "nombre": "string con nombre completo",
    "rut": "string con RUT o null",
    "email": "string o null",
    "telefono": "string o null",
    "ciudad": "string con ciudad/país o null",
    "resumen": "string con resumen o perfil profesional o null"
  },
  "educacion": [
    {
      "institucion": "nombre de la institución",
      "titulo": "nombre del título o carrera",
      "anio_egreso": número entero o null,
      "nivel": "Ingeniería | Técnico | Postgrado | Diplomado | Certificación | Otro"
    }
  ],
  "certificaciones": [
    {
      "nombre": "nombre del curso o certificación",
      "institucion": "string o null",
      "anio": número o null,
      "estado": "completado | en_curso"
    }
  ],
  "experiencias": [
    {
      "empresa": "nombre de la empresa",
      "cargo": "nombre del cargo",
      "fecha_inicio": "YYYY-MM o null",
      "fecha_fin": "YYYY-MM o null (null si es actual)",
      "es_actual": true | false,
      "descripcion": "texto de funciones y logros",
      "skills_utilizadas": ["skill1", "skill2", ...]
    }
  ],
  "skills_generales": [
    {
      "nombre": "nombre normalizado de la skill",
      "categoria": "lenguaje | framework | base_datos | cloud | devops | metodologia | herramienta | otro"
    }
  ]
}
```

El prompt pide normalizar nombres de tecnologías (Java, JavaScript, Angular, Spring Boot, Node.js, PostgreSQL, Docker, AWS, etc.) y clasificar cada skill en una de las categorías indicadas, para mantener consistencia en la BD y en las búsquedas.

### 7.4 Carga en la base de datos relacional

**Contexto:** La persistencia en PostgreSQL ocurre dentro del mismo flujo de la petición al backend. No se usa un endpoint REST adicional: el backend que recibió el PDF en **POST http://localhost:3001/api/profesionales/cargar-cv** ejecuta las inserciones en la BD y, si todo es correcto, responde **201 Created** por ese mismo endpoint con un resumen (nombre del profesional, cantidad de skills y experiencias, archivo guardado).

Todo el guardado se hace en **una transacción** (`BEGIN` … `COMMIT`; en error, `ROLLBACK`):

1. **profesional**: `INSERT` con nombre, rut, email, telefono, ciudad, resumen y `archivo_cv` (nombre del archivo guardado en `uploads`). Se obtiene `profesionalId` del `RETURNING id`.

2. **profesional_educacion**: Por cada elemento de `cvData.educacion` que tenga `institucion` y `titulo`, se inserta una fila con `profesional_id`, institucion, titulo, anio_egreso, nivel (por defecto `'Otro'` si no viene).

3. **profesional_certificacion**: Por cada elemento de `cvData.certificaciones` con `nombre`, se inserta con profesional_id, nombre, institucion, anio, estado (por defecto `'completado'`).

4. **Skills generales**:
   - Por cada item en `cvData.skills_generales` con `nombre`:
     - **upsert** en la tabla **skill** (insert o update por conflicto en `nombre`); se obtiene `skill_id`.
     - **INSERT** en **profesional_skill** (`profesional_id`, `skill_id`) con `ON CONFLICT DO NOTHING` para no duplicar la relación.

5. **experiencia_laboral** y **experiencia_skill**:
   - Por cada elemento de `cvData.experiencias` con `empresa` y `cargo`:
     - **INSERT** en **experiencia_laboral** (profesional_id, empresa, cargo, fecha_inicio, fecha_fin, es_actual, descripcion). Las fechas se normalizan a tipo fecha añadiendo `-01` cuando vienen en formato `YYYY-MM`. Se obtiene el `id` de la experiencia.
     - Por cada skill en `skills_utilizadas` de esa experiencia:
       - **upsert** en **skill** (por nombre, categoría `'otro'` si no se especifica) y se obtiene `skill_id`.
       - **INSERT** en **experiencia_skill** (experiencia_laboral_id, skill_id) con `ON CONFLICT DO NOTHING`.
       - **INSERT** en **profesional_skill** (profesional_id, skill_id) con `ON CONFLICT DO NOTHING`, para que el profesional quede con todas las skills que aparecen en sus experiencias.

6. **COMMIT**: Si todas las inserciones son correctas, se hace `COMMIT` y se devuelve `profesionalId` al route. El backend responde **201 Created** al cliente que realizó **POST http://localhost:3001/api/profesionales/cargar-cv** con un cuerpo JSON que incluye resumen (nombre, cantidad de skills y experiencias, archivo guardado). Cualquier excepción hace **ROLLBACK** y se propaga el error (respuesta 500 por el mismo endpoint).

---

## 8. Por qué es conveniente usar la API de Anthropic (Claude) para el procesamiento del PDF

1. **Procesamiento multimodal nativo**: La API de Anthropic permite enviar el PDF directamente como documento (base64 + `media_type: application/pdf`). Claude interpreta el contenido del PDF (texto y estructura) sin que el desarrollador tenga que integrar un motor de OCR o de extracción de texto por separado, lo que simplifica el backend y reduce puntos de fallo.

2. **Comprensión del lenguaje natural**: Los CVs están en lenguaje natural (español), con formatos y redacciones muy variables. Un modelo de lenguaje como Claude entiende contexto, sinónimos, abreviaturas y variaciones (ej. “Actualmente”, “al presente”, “hasta la fecha”) y puede mapearlos a campos estructurados (por ejemplo `es_actual`, `fecha_fin = null`) de forma más fiable que reglas fijas o expresiones regulares.

3. **Extracción estructurada bajo prompt**: El sistema no solo “lee” el PDF, sino que exige una salida en JSON con una estructura fija (profesional, educación, certificaciones, experiencias, skills) y reglas de normalización (nombres de tecnologías, categorías). Claude sigue bien instrucciones de formato y normalización, lo que permite integrar directamente el resultado con la base de datos relacional sin una capa intermedia de transformación compleja.

4. **Mantenibilidad**: Cambios en los campos a extraer o en las reglas de normalización se hacen principalmente en el prompt y en el código que interpreta el JSON, sin cambiar motores de OCR o pipelines de NLP propios. Esto facilita evolucionar el sistema (nuevos campos, nuevos idiomas, nuevas categorías de skills).

5. **Calidad y consistencia**: Un modelo de última generación como Claude Opus ofrece buena precisión en la extracción y en la clasificación de skills (lenguaje, framework, base_datos, cloud, etc.), lo que mejora la calidad de los datos en la BD y la utilidad de las búsquedas por skills y filtros.

6. **Coste y escalado**: Se paga por uso (tokens de entrada y salida), sin mantener infraestructura de modelos propios. Para volúmenes moderados de CVs (por ejemplo en una empresa o equipo de RR.HH.), suele ser más práctico que montar y mantener un pipeline propio de extracción de información desde PDFs.

En conjunto, usar la API de Anthropic para el procesamiento del PDF permite que el sistema se centre en la lógica de negocio (validación, transacciones en BD, API REST y frontend) y delegue la parte más compleja —entender y estructurar el contenido del CV— a un modelo de IA que ya está preparado para documentos y para seguir instrucciones en JSON.

---

## 9. Edición de ficha y sincronización RAG

El sistema permite **editar** la información de una ficha (currículum) ya cargada. Al guardar los cambios, los **vectores RAG** asociados a ese profesional se **eliminan** y se **vuelven a generar** a partir del JSON actualizado, con el mismo criterio que en la carga de un CV (fragmentos por sección, embeddings con OpenAI, tablas `documento_rag` y `documento_rag_chunk`). Así la Búsqueda IA refleja siempre el contenido actual de la ficha.

A continuación se describen **paso a paso** las modificaciones realizadas en base de datos, backend y frontend.

### 9.1 Base de datos

**No se requieren cambios de esquema.** Las tablas existentes ya soportan la edición:

- **profesional**: se actualizan `nombre`, `rut`, `email`, `telefono`, `ciudad`, `resumen`. No se modifican `archivo_cv` ni `fecha_carga`.
- **profesional_educacion**, **profesional_certificacion**, **profesional_skill**, **experiencia_laboral** (y por CASCADE **experiencia_skill**): la lógica de actualización **reemplaza** todos los registros hijos del profesional: se borran los existentes y se insertan los nuevos según el JSON enviado.
- **documento_rag** y **documento_rag_chunk**: para reindexar tras editar, se **eliminan** las filas de `documento_rag` cuyo `profesional_id` coincide (el `ON DELETE CASCADE` de la FK de `documento_rag_chunk` borra los chunks). Luego se vuelve a indexar con `indexDocument`, que inserta un nuevo registro en `documento_rag` y los chunks con embeddings correspondientes.

Resumen: no hay migraciones ni nuevos scripts SQL; solo uso de `DELETE` por `profesional_id` en las tablas hijas y en `documento_rag`.

### 9.2 Backend

1. **ragService.js**
   - **Nueva función `deleteRagByProfesionalId(profesionalId)`**: ejecuta `DELETE FROM documento_rag WHERE profesional_id = $1`. Los chunks se eliminan en cascada. Se usa antes de reindexar tras una edición para que no queden vectores obsoletos.

2. **dbService.js**
   - **Nueva función `updateProfesional(profesionalId, cvData)`**: recibe el mismo formato `cvData` que `saveCVToDatabase` (profesional, educacion, certificaciones, experiencias, skills_generales). Dentro de una transacción:
     - `UPDATE profesional` con nombre, rut, email, telefono, ciudad, resumen (sin tocar archivo_cv ni fecha_carga).
     - `DELETE` de `profesional_educacion`, `profesional_certificacion`, `profesional_skill` y `experiencia_laboral` donde `profesional_id = profesionalId`.
     - Reinserción de educación, certificaciones, skills (upsert en catálogo + profesional_skill) y experiencias con sus skills (igual que en `saveCVToDatabase`).
   - Se exporta `updateProfesional` en el `module.exports`.

3. **routes/profesionales.js**
   - **Helper `apiBodyToCvData(body)`**: convierte el cuerpo JSON de la API (mismo formato que devuelve `GET /api/profesionales/:id`: nombre, rut, email, educacion[], certificaciones[], experiencias[] con `skills[]`, skills[]) al formato `cvData` que esperan `updateProfesional` e `indexDocument` (profesional, educacion, certificaciones, experiencias con `skills_utilizadas`, skills_generales).
   - **Nueva ruta `PUT /api/profesionales/:id`**:
     - Valida el ID y que el profesional exista (`getProfesionalById`).
     - Valida que el body tenga al menos `nombre`.
     - Convierte el body a `cvData` con `apiBodyToCvData`.
     - Llama a `updateProfesional(id, cvData)`.
     - Llama a `deleteRagByProfesionalId(id)` para borrar vectores antiguos.
     - Si existe `OPENAI_API_KEY` y el profesional tiene `archivo_cv`, llama a `indexDocument(id, archivo_cv, nombreActualizado, cvData)` para generar los nuevos vectores con el mismo mecanismo que en la carga de un CV.
     - Responde con `{ success, mensaje, profesional_id }` o error 400/404/500.

### 9.3 Frontend

1. **services/api.js**
   - **Nueva función `updateProfesional(id, data)`**: envía `PUT /api/profesionales/:id` con el cuerpo `data` (objeto con nombre, rut, email, educacion, certificaciones, experiencias, skills en el formato que devuelve el GET).

2. **components/DetalleProfesional.jsx**
   - Se añade la prop **`onEdit`** (callback opcional).
   - En la barra de acciones del detalle se añade un botón **"Editar ficha"** (visible solo si `onEdit` está definido). Al pulsarlo se llama `onClose()` y luego `onEdit(data.id)`, de modo que se cierra el modal y el padre abre la vista de edición.

3. **pages/Profesionales.jsx**
   - Estado **`editandoId`**: cuando tiene valor, en lugar del listado se renderiza el componente de edición.
   - Si `editandoId` está definido, se retorna `<EditarProfesional profesionalId={editandoId} onClose={...} onSaved={...} />` y no se muestra la lista ni el modal de detalle.
   - Al hacer clic en "Editar ficha" desde el detalle se ejecuta `onEdit(id)`, que hace `setEditandoId(id)` (y el modal se cierra porque el padre ya no muestra el detalle en ese flujo).
   - **`EditarProfesional`** recibe `onSaved(id)`: al guardar con éxito se llama `onSaved(profesionalId)`, se pone `editandoId` a `null`, se asigna `selectedId = id` para reabrir el modal de detalle con los datos actualizados y se refresca la lista (`cargarProfesionales()`).

4. **pages/EditarProfesional.jsx** (nuevo)
   - Componente de formulario que carga los datos con `GET /api/profesionales/:id` y el catálogo de skills con `GET /api/profesionales/skills`.
   - Estado local con la misma estructura que la respuesta del GET (nombre, rut, email, ciudad, resumen, educacion[], certificaciones[], experiencias[] con skills[], skills[]).
   - Secciones editables: datos personales, skills (añadir/quitar desde catálogo), educación (filas añadir/quitar), certificaciones (filas añadir/quitar), experiencias laborales (empresa, cargo, fechas, es_actual, descripción, skills por experiencia).
   - Al enviar el formulario se construye el payload en el formato esperado por el backend (igual que el GET pero solo campos editables) y se llama a `updateProfesional(profesionalId, payload)`.
   - Tras éxito se ejecuta `onSaved(profesionalId)` y `onClose()`; en caso de error se muestra el mensaje en pantalla.

5. **index.css**
   - Clase **`.input-label`** para etiquetas de formulario (tamaño y color coherentes con el resto de la UI).

Con esto queda implementada la edición de fichas y la sincronización de los vectores RAG: al modificar un currículum se eliminan sus vectores y se cargan nuevos a partir del JSON actualizado, usando el mismo mecanismo que en la carga de un CV.
