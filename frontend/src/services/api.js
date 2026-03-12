// src/services/api.js
import axios from 'axios';

const API = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
    timeout: 120000, // 2 min — Claude puede tardar en procesar PDFs largos
});

// ── Profesionales ───────────────────────────────────────────────────────────

export const cargarCV = (file, onUploadProgress) => {
    const form = new FormData();
    form.append('cv', file);
    return API.post('/profesionales/cargar-cv', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
    });
};

export const getProfesionales = (params = {}) =>
    API.get('/profesionales', { params });

export const getProfesionalById = (id) =>
    API.get(`/profesionales/${id}`);

export const updateProfesional = (id, data) =>
    API.put(`/profesionales/${id}`, data);

export const deleteProfesional = (id) =>
    API.delete(`/profesionales/${id}`);

export const getSkillsCatalogo = () =>
    API.get('/profesionales/skills');

export const buscarPorSkills = (skills) =>
    API.get('/profesionales/buscar-por-skills', {
        params: { skills: skills.join(',') },
    });

export const getCVUrl = (id) =>
    `${API.defaults.baseURL}/profesionales/${id}/cv`;

// ── RAG - Búsqueda en lenguaje natural ─────────────────────────────────────
export const busquedaRag = (query) =>
    API.post('/rag/buscar', { query });
