const fs = require('fs');
const path = require('path');
// pdf-parse v2 exporta la clase PDFParse; algunos entornos la exponen como .default o directamente
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse || pdfParseModule;

const pdfPath = process.argv[2] || path.join(__dirname, '..', 'uploads', 'UN_ARCHIVO.pdf');

if (!fs.existsSync(pdfPath)) {
  console.error('Uso: node extractPdfText.js <ruta-al.pdf>');
  console.error('El archivo no existe:', pdfPath);
  process.exit(1);
}

const dataBuffer = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data: dataBuffer });

parser
  .getText()
  .then((result) => {
    console.log('Páginas:', result.total);
    console.log('--- TEXTO (primeros 10000 caracteres) ---');
    console.log(result.text.substring(0, 10000));
  })
  .catch((err) => console.error('Error:', err));