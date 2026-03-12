// src/components/DetalleProfesional.jsx
import { useState, useEffect } from 'react';
import { getProfesionalById, deleteProfesional, getCVUrl } from '../services/api';

const CATEGORIA_LABEL = {
    lenguaje: 'Lenguaje', framework: 'Framework', base_datos: 'Base de Datos',
    cloud: 'Cloud', devops: 'DevOps', metodologia: 'Metodología',
    herramienta: 'Herramienta', otro: 'Otro',
};

function formatDate(dateStr) {
    if (!dateStr) return 'Presente';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CL', { year: 'numeric', month: 'short' });
}

function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const k = item[key] || 'otro';
        if (!acc[k]) acc[k] = [];
        acc[k].push(item);
        return acc;
    }, {});
}

export default function DetalleProfesional({ profesionalId, onClose, onDeleted, onEdit }) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [confirm, setConfirm] = useState(false);

    useEffect(() => {
        if (!profesionalId) return;
        setLoading(true);
        getProfesionalById(profesionalId)
            .then(res => { setData(res.data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [profesionalId]);

    const handleDelete = async () => {
        await deleteProfesional(profesionalId);
        onDeleted?.();
        onClose();
    };

    if (!profesionalId) return null;

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-panel">
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                        <span className="loader-ring" style={{ width: 32, height: 32 }} />
                    </div>
                ) : !data ? (
                    <div className="empty-state">
                        <span className="icon">⚠️</span>
                        <p>No se pudo cargar el profesional</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div style={{ marginBottom: 24, position: 'relative' }}>
                            <button
                                onClick={onClose}
                                style={{
                                    position: 'absolute', right: 0, top: 0,
                                    background: 'none', border: 'none',
                                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem'
                                }}
                            >✕</button>

                            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                                <div className="prof-card-avatar" style={{ width: 52, height: 52, fontSize: '1.3rem' }}>
                                    {data.nombre.charAt(0)}
                                </div>
                                <div style={{ flex: 1, paddingRight: 32 }}>
                                    <h2 style={{ fontFamily: 'Syne', fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>
                                        {data.nombre}
                                    </h2>
                                    {data.ultimo_cargo && (
                                        <div style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>
                                            {data.ultimo_cargo} · {data.ultima_empresa}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                        {data.email    && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>✉ {data.email}</span>}
                                        {data.telefono && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📱 {data.telefono}</span>}
                                        {data.ciudad   && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📍 {data.ciudad}</span>}
                                        {data.rut      && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>🪪 {data.rut}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Acciones */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                                {onEdit && (
                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => { onClose(); onEdit(data.id); }}>
                                        ✏️ Editar ficha
                                    </button>
                                )}
                                <a
                                    href={getCVUrl(data.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-outline btn-sm"
                                    style={{ textDecoration: 'none' }}
                                >
                                    📄 Ver PDF original
                                </a>
                                {!confirm ? (
                                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>
                                        🗑 Eliminar
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-2)' }}>¿Confirmar?</span>
                                        <button className="btn btn-danger btn-sm" onClick={handleDelete}>Sí, eliminar</button>
                                        <button className="btn btn-outline btn-sm" onClick={() => setConfirm(false)}>Cancelar</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Resumen */}
                        {data.resumen && (
                            <div className="detail-section">
                                <h3>Perfil Profesional</h3>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                    {data.resumen}
                                </p>
                            </div>
                        )}

                        {/* Skills agrupadas por categoría */}
                        {data.skills?.length > 0 && (
                            <div className="detail-section">
                                <h3>Skills y Tecnologías ({data.skills.length})</h3>
                                {Object.entries(groupBy(data.skills, 'categoria')).map(([cat, items]) => (
                                    <div key={cat} style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                            {CATEGORIA_LABEL[cat] || cat}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                            {items.map(s => (
                                                <span key={s.id} className={`skill-badge ${s.categoria}`}>{s.nombre}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Experiencia */}
                        {data.experiencias?.length > 0 && (
                            <div className="detail-section">
                                <h3>Experiencia Laboral ({data.experiencias.length} posiciones)</h3>
                                {data.experiencias.map(exp => (
                                    <div key={exp.id} className="timeline-item">
                                        <div className="timeline-date">
                                            {formatDate(exp.fecha_inicio)} — {exp.es_actual ? 'Presente' : formatDate(exp.fecha_fin)}
                                            {exp.es_actual && (
                                                <span style={{ marginLeft: 6, fontSize: '0.65rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 10, border: '1px solid rgba(0,212,170,0.3)' }}>
                                                    Actual
                                                </span>
                                            )}
                                        </div>
                                        <div className="timeline-company">{exp.empresa}</div>
                                        <div className="timeline-role">{exp.cargo}</div>
                                        {exp.descripcion && (
                                            <p className="timeline-desc">{exp.descripcion.substring(0, 250)}{exp.descripcion.length > 250 ? '...' : ''}</p>
                                        )}
                                        {exp.skills?.filter(Boolean).length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                                                {exp.skills.filter(Boolean).map(s => (
                                                    <span key={s} className="skill-badge otro" style={{ fontSize: '0.68rem' }}>{s}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Educación */}
                        {data.educacion?.length > 0 && (
                            <div className="detail-section">
                                <h3>Educación</h3>
                                {data.educacion.map(edu => (
                                    <div key={edu.id} className="timeline-item">
                                        <div className="timeline-company">{edu.titulo}</div>
                                        <div className="timeline-role">{edu.institucion}</div>
                                        {edu.anio_egreso && (
                                            <div className="timeline-date">{edu.anio_egreso}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Certificaciones */}
                        {data.certificaciones?.length > 0 && (
                            <div className="detail-section">
                                <h3>Cursos y Certificaciones ({data.certificaciones.length})</h3>
                                {data.certificaciones.map(cert => (
                                    <div key={cert.id} className="timeline-item">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div className="timeline-company" style={{ fontSize: '0.85rem' }}>{cert.nombre}</div>
                                                {cert.institucion && (
                                                    <div className="timeline-role">{cert.institucion}</div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                                                {cert.anio && <span className="timeline-date" style={{ marginBottom: 0 }}>{cert.anio}</span>}
                                                <span style={{
                                                    fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10,
                                                    background: cert.estado === 'en_curso' ? 'rgba(255,200,100,0.1)' : 'var(--accent-dim)',
                                                    color: cert.estado === 'en_curso' ? '#ffc864' : 'var(--accent)',
                                                    border: `1px solid ${cert.estado === 'en_curso' ? 'rgba(255,200,100,0.3)' : 'rgba(0,212,170,0.3)'}`,
                                                }}>
                                                    {cert.estado === 'en_curso' ? 'En curso' : 'Completado'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
                            Cargado el {new Date(data.fecha_carga).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
