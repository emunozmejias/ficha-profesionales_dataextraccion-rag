# Backend Node.js - Ficha de Profesionales
FROM node:20-alpine

WORKDIR /app

# Dependencias
COPY package*.json ./
RUN npm ci --only=production 2>/dev/null || npm install --omit=dev

# Código
COPY src ./src

# Carpeta de uploads (volumen en runtime)
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "src/server.js"]
