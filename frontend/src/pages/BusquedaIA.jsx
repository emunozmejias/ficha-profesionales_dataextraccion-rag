// src/pages/BusquedaIA.jsx
// Búsqueda en lenguaje natural sobre el contenido de los CVs (RAG)
import { useState } from 'react';
import { busquedaRag } from '../services/api';

export default function BusquedaIA({ onVerProfesional }) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleBuscar = async () => {
        const q = query.trim();
        if (!q) return;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await busquedaRag(q);
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Error en la búsqueda');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Búsqueda IA</h1>
                <p className="page-subtitle">
                    Pregunta en lenguaje natural sobre el contenido de los currículums. La respuesta indica el archivo PDF y el profesional de donde proviene la información.
                </p>
            </div>

            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-title">Escribe tu consulta</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleBuscar())}
                        placeholder="Ej: ¿Quién tiene experiencia con React y Node? ¿Quién trabajó en bancos? ¿Quién tiene certificaciones en cloud?"
                        rows={3}
                        style={{
                            width: '100%',
                            padding: 14,
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-bright)',
                            fontSize: '0.95rem',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                        }}
                        disabled={loading}
                    />
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleBuscar}
                        disabled={loading || !query.trim()}
                    >
                        {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="card" style={{ borderColor: 'var(--accent-2)', marginBottom: 24 }}>
                    <div style={{ color: 'var(--accent-2)', fontSize: '0.9rem' }}>{error}</div>
                </div>
            )}

            {result && (
                <>
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div className="card-title">Respuesta</div>
                        <div style={{
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.7,
                            fontSize: '0.95rem',
                            color: 'var(--text-bright)',
                        }}>
                            {result.answer}
                        </div>
                    </div>

                    {result.sources && result.sources.length > 0 && (
                        <div className="card">
                            <div className="card-title">Fuentes</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 12 }}>
                                Información obtenida de los siguientes CVs:
                            </p>
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {result.sources.map((s, i) => (
                                    <li
                                        key={`${s.profesional_id}-${s.archivo_cv}-${i}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: 8,
                                            padding: 12,
                                            borderRadius: 'var(--radius)',
                                            background: 'var(--navy)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                                {s.profesional_nombre}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Archivo PDF: {s.archivo_cv}
                                            </div>
                                        </div>
                                        {onVerProfesional && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ flexShrink: 0 }}
                                                onClick={() => onVerProfesional(s.profesional_id)}
                                            >
                                                Ver ficha
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
