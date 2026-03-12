// src/services/claudeService.js
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
require('dotenv').config();

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `
Eres un asistente especializado en análisis de currículums vitae en español.
Analiza el CV adjunto y extrae TODA la información disponible con la mayor precisión posible.

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
 * Extrae datos estructurados de un CV en formato PDF usando Claude AI
 * @param {string} pdfFilePath - Ruta absoluta al archivo PDF
 * @returns {Object} - Datos estructurados del CV
 */
async function extractCVData(pdfFilePath) {
    console.log(`🤖 Iniciando extracción con Claude para: ${pdfFilePath}`);

    // Leer PDF y convertir a base64
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Llamar a la API de Claude
    const response = await client.messages.create({
        model:      process.env.CLAUDE_MODEL || 'claude-opus-4-5',
        max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4000'),
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'document',
                        source: {
                            type:       'base64',
                            media_type: 'application/pdf',
                            data:       pdfBase64,
                        },
                    },
                    {
                        type: 'text',
                        text: EXTRACTION_PROMPT,
                    },
                ],
            },
        ],
    });

    const rawText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

    console.log('📄 Respuesta recibida de Claude, parseando JSON...');

    // Parsear JSON con manejo robusto de errores
    let cvData;
    try {
        cvData = JSON.parse(rawText);
    } catch {
        // Intentar extraer JSON si hay texto extra
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
            cvData = JSON.parse(match[0]);
        } else {
            throw new Error('Claude no retornó un JSON válido. Respuesta: ' + rawText.substring(0, 200));
        }
    }

    // Validación básica de estructura
    if (!cvData.profesional || !cvData.profesional.nombre) {
        throw new Error('No se pudo identificar el nombre del profesional en el CV');
    }

    // Garantizar que los arrays existan aunque Claude los omita
    cvData.educacion        = cvData.educacion        || [];
    cvData.certificaciones  = cvData.certificaciones  || [];
    cvData.experiencias     = cvData.experiencias     || [];
    cvData.skills_generales = cvData.skills_generales || [];

    console.log(`✅ Datos extraídos: ${cvData.skills_generales.length} skills, ${cvData.experiencias.length} experiencias`);
    return cvData;
}

module.exports = { extractCVData };
