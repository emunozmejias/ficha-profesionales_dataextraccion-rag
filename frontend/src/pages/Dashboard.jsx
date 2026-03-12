// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { getProfesionales, getSkillsCatalogo } from '../services/api';

export default function Dashboard({ onNavegar }) {
    const [stats,  setStats]  = useState({ total: 0, skills: 0, topSkills: [] });
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            getProfesionales({ page: 1, limit: 6 }),
            getSkillsCatalogo(),
        ]).then(([profRes, skillsRes]) => {
            setStats({
                total:     profRes.data.total,
                skills:    skillsRes.data.length,
                topSkills: skillsRes.data.slice(0, 8),
            });
            setRecent(profRes.data.data);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <span className="loader-ring" style={{ width: 40, height: 40 }} />
        </div>
    );

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Panel Principal</h1>
                <p className="page-subtitle">Resumen del sistema de ficha de profesionales</p>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card">
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">👥 Profesionales registrados</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.skills}</div>
                    <div className="stat-label">⚡ Skills en catálogo</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.topSkills[0]?.num_profesionales || 0}</div>
                    <div className="stat-label">🏆 Profesionales con skill top</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* Skills más frecuentes */}
                <div className="card">
                    <div className="card-title">⚡ Skills más frecuentes</div>
                    {stats.topSkills.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Aún no hay skills cargadas. Sube un CV para comenzar.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {stats.topSkills.map((s, i) => (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: 6,
                                        background: 'var(--accent-dim)', color: 'var(--accent)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                                    }}>{i + 1}</span>
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            fontSize: '0.82rem', marginBottom: 3,
                                        }}>
                                            <span>{s.nombre}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{s.num_profesionales}</span>
                                        </div>
                                        <div style={{ height: 3, borderRadius: 3, background: 'var(--border)' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 3,
                                                background: 'var(--accent)',
                                                width: `${(s.num_profesionales / (stats.topSkills[0]?.num_profesionales || 1)) * 100}%`,
                                                transition: 'width 0.5s ease',
                                            }} />
                                        </div>
                                    </div>
                                    <span className={`skill-badge ${s.categoria}`} style={{ fontSize: '0.62rem' }}>
                                        {s.categoria}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Profesionales recientes */}
                <div className="card">
                    <div className="card-title">🕐 Cargados recientemente</div>
                    {recent.length === 0 ? (
                        <div className="empty-state" style={{ padding: 20 }}>
                            <span className="icon" style={{ fontSize: '2rem' }}>📂</span>
                            <p>Aún no hay profesionales. Carga el primer CV.</p>
                            <button
                                className="btn btn-primary btn-sm"
                                style={{ marginTop: 12 }}
                                onClick={() => onNavegar('cargar')}
                            >
                                + Cargar CV
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {recent.map(p => {
                                const initials = p.nombre.split(' ').map(w => w[0]).slice(0, 2).join('');
                                return (
                                    <div
                                        key={p.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 0', borderBottom: '1px solid var(--border)',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => onNavegar('profesionales')}
                                    >
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)',
                                            flexShrink: 0,
                                        }}>{initials}</div>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {p.nombre}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {p.ultimo_cargo || p.ciudad || '—'}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                                            {new Date(p.fecha_carga).toLocaleDateString('es-CL')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Acciones rápidas */}
            <div className="card" style={{ marginTop: 20 }}>
                <div className="card-title">🚀 Acciones Rápidas</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => onNavegar('cargar')}>
                        📤 Cargar nuevo CV
                    </button>
                    <button className="btn btn-outline" onClick={() => onNavegar('profesionales')}>
                        👥 Ver todos los profesionales
                    </button>
                    <button className="btn btn-outline" onClick={() => onNavegar('buscar')}>
                        🔍 Búsqueda avanzada por skills
                    </button>
                </div>
            </div>
        </div>
    );
}
