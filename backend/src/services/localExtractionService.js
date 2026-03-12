// src/services/localExtractionService.js
// Extracción de datos de CV desde PDF usando texto extraído + Ollama (modelo local)
const fs = require('fs');
require('dotenv').config();

const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse || pdfParseModule;

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const EXTRACTION_PROMPT = `
Eres un asistente especializado en análisis de currículums vitae en español.
A continuación se te proporciona el TEXTO EXTRAÍDO de un CV. Analízalo y extrae TODA la información disponible con la mayor precisión posible.

Responde ÚNICAMENTE con un objeto JSON válido. Sin texto adicional, sin explicaciones,
sin bloques de código markdown, sin backticks. Solo el JSON puro.

El JSON debe tener EXACTAMENTE esta estructura:

{
  "profesional": {
    "nombre": "string con nombre completo",
    "rut": "string con RUT o null si no aparece",
    "email": "string con email o null",
    "telefono": "string con teléfono o null",
    "ciudad": "string con ciudad/país o null",
    "resumen": "string con el resumen o perfil profesional completo o null"
  },
  "educacion": [
    {
      "institucion": "nombre de la institución",
      "titulo": "nombre del título o carrera",
      "anio_egreso": número entero del año o null,
      "nivel": "uno de: Ingeniería, Técnico, Postgrado, Diplomado, Certificación, Otro"
    }
  ],
  "certificaciones": [
    {
      "nombre": "nombre completo del curso o certificación",
      "institucion": "institución que lo otorga o null",
      "anio": número entero del año o null,
      "estado": "completado o en_curso"
    }
  ],
  "experiencias": [
    {
      "empresa": "nombre de la empresa",
      "cargo": "nombre del cargo o posición",
      "fecha_inicio": "YYYY-MM como string o null",
      "fecha_fin": "YYYY-MM como string o null (null si es trabajo actual)",
      "es_actual": true o false,
      "descripcion": "descripción detallada de las funciones y logros",
      "skills_utilizadas": ["lista", "de", "tecnologías", "usadas", "en", "este", "trabajo"]
    }
  ],
  "skills_generales": [
    {
      "nombre": "nombre normalizado de la skill",
      "categoria": "uno de: lenguaje, framework, base_datos, cloud, devops, metodologia, herramienta, otro"
    }
  ]
}

REGLAS DE NORMALIZACIÓN (muy importantes):
1. Normaliza nombres de tecnologías:
   - "JAVA" o "java" → "Java"
   - "angularJS" o "ANGULAR" o "Angular 11/14/17" → "Angular"
   - "springboot" o "Spring Boot" o "Springboot" → "Spring Boot"
   - "nodeJS" o "Node JS" o "NODE" → "Node.js"
   - "postgresql" o "POSTGRESQL" → "PostgreSQL"
   - "javascript" o "JAVASCRIPT" o "Javascript" → "JavaScript"
   - "typescript" o "Typescrept" → "TypeScript"
   - "nestjs" o "Nest JS" → "NestJS"
   - "reactjs" o "React JS" → "React"
   - "git" o "GIT" → "Git"
   - "docker" o "DOCKER" → "Docker"
   - "kubernetes" o "Kubernete" → "Kubernetes"
   - "aws" → "AWS"
   - "gcp" → "GCP"

2. Categorías de skills:
   - lenguaje: Java, JavaScript, TypeScript, Python, C#, PL/SQL, SQL, PHP, Go, etc.
   - framework: Angular, React, Spring Boot, Node.js, NestJS, .NET, Django, etc.
   - base_datos: PostgreSQL, MySQL, MongoDB, Oracle, SQL Server, Sybase, etc.
   - cloud: AWS, GCP, Azure, OpenShift, etc.
   - devops: Docker, Kubernetes, Jenkins, Git, GitLab, GitHub, CI/CD, etc.
   - metodologia: Scrum, Agile, RUP, Kanban, etc.
   - herramienta: Jira, Confluence, Bitbucket, IntelliJ, VS Code, Postman, etc.
   - otro: todo lo que no encaje en las anteriores

3. Si una fecha dice "Actualmente", "presente", "la fecha", "hoy": es_actual=true, fecha_fin=null
4. Si el CV tiene sección de "Skills" o "Conocimientos", inclúyelos todos en skills_generales
5. También extrae las skills mencionadas en cada experiencia y ponlas en skills_utilizadas
6. No inventes información que no esté en el CV
7. Si un campo no existe, usa null (no uses cadenas vacías "")
`;

/**
 * Extrae el texto de un PDF usando pdf-parse (PDFParse v2)
 * @param {string} pdfFilePath - Ruta absoluta al archivo PDF
 * @returns {Promise<string>} - Texto extraído
 */
async function extractTextFromPdf(pdfFilePath) {
    const dataBuffer = fs.readFileSync(pdfFilePath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    return (result.text || '').trim();
}

/**
 * Envía el texto del CV a Ollama y obtiene la respuesta (JSON esperado)
 * @param {string} textWithPrompt - Mensaje completo: instrucciones + texto del CV
 * @returns {Promise<string>} - Contenido de la respuesta del asistente
 */
async function callOllama(textWithPrompt) {
    const url = `${OLLAMA_BASE_URL}/api/chat`;
    const body = {
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: textWithPrompt }],
        stream: false,
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.message?.content;
    if (content == null) {
        throw new Error('Ollama no devolvió message.content en la respuesta');
    }
    return typeof content === 'string' ? content : String(content);
}

/**
 * Extrae datos estructurados de un CV en formato PDF usando texto + Ollama (local)
 * @param {string} pdfFilePath - Ruta absoluta al archivo PDF
 * @returns {Promise<Object>} - Datos estructurados del CV (misma forma que claudeService)
 */
async function extractCVData(pdfFilePath) {
    console.log(`🤖 Iniciando extracción local (Ollama) para: ${pdfFilePath}`);

    const pdfText = await extractTextFromPdf(pdfFilePath);
    if (!pdfText || pdfText.length < 50) {
        throw new Error('No se pudo extraer texto del PDF o el contenido es demasiado corto. Comprueba que el PDF tenga texto seleccionable.');
    }

    const userMessage = `${EXTRACTION_PROMPT}\n\n--- TEXTO DEL CV ---\n\n${pdfText}`;

    console.log('📤 Enviando texto a Ollama...');
    const rawText = await callOllama(userMessage);

    console.log('📄 Respuesta recibida de Ollama, parseando JSON...');

    let cvData;
    try {
        cvData = JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
            cvData = JSON.parse(match[0]);
        } else {
            throw new Error('Ollama no retornó un JSON válido. Respuesta: ' + rawText.substring(0, 200));
        }
    }

    if (!cvData.profesional || !cvData.profesional.nombre) {
        throw new Error('No se pudo identificar el nombre del profesional en el CV');
    }

    cvData.educacion = cvData.educacion || [];
    cvData.certificaciones = cvData.certificaciones || [];
    cvData.experiencias = cvData.experiencias || [];
    cvData.skills_generales = cvData.skills_generales || [];

    console.log(`✅ Datos extraídos: ${cvData.skills_generales.length} skills, ${cvData.experiencias.length} experiencias`);
    return cvData;
}

module.exports = { extractCVData };
