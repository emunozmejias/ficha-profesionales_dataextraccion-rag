# Frontend React - build y servicio con nginx
# Etapa 1: build
FROM node:20-alpine AS builder

WORKDIR /app

# URL del API que usará el navegador (host:puerto del backend)
ARG REACT_APP_API_URL=http://localhost:3011/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Etapa 2: servir con nginx
FROM nginx:alpine

# Configuración para SPA (fallback a index.html)
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
  }' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
