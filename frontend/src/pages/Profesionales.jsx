// src/pages/Profesionales.jsx
import { useState, useEffect, useCallback } from 'react';
import { getProfesionales, getSkillsCatalogo, buscarPorSkills } from '../services/api';
import DetalleProfesional from '../components/DetalleProfesional';
import EditarProfesional from './EditarProfesional';

export default function Profesionales({ initialOpenId, onClearInitialOpenId, modoInicial = 'texto' }) {
    const [profesionales, setProfesionales] = useState([]);
    const [total,         setTotal]         = useState(0);
    const [loading,       setLoading]       = useState(true);
    const [search,        setSearch]        = useState('');
    const [selectedId,    setSelectedId]    = useState(null);
    const [editandoId,    setEditandoId]    = useState(null);
    const [page,          setPage]          = useState(1);

    // Búsqueda por skills; modoInicial: 'texto' = Búsqueda general, 'skills' = Filtrar por Skills
    const [skillsCatalogo,    setSkillsCatalogo]    = useState([]);
    const [skillQuery,        setSkillQuery]        = useState('');
    const [skillsSeleccionadas, setSkillsSeleccionadas] = useState([]);
    const [resultadosSkills,  setResultadosSkills]  = useState(null);
    const [buscandoSkills,    setBuscandoSkills]    = useState(false);
    const [modoFiltro,        setModoFiltro]        = useState(modoInicial === 'skills' ? 'skills' : 'texto');

    const LIMIT = 12;

    const cargarProfesionales = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getProfesionales({ page, limit: LIMIT, search });
            setProfesionales(res.data.data);
            setTotal(res.data.total);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => { cargarProfesionales(); }, [cargarProfesionales]);

    useEffect(() => {
        getSkillsCatalogo().then(res => setSkillsCatalogo(res.data));
    }, []);

    useEffect(() => {
        if (initialOpenId != null && onClearInitialOpenId) {
            setSelectedId(initialOpenId);
            onClearInitialOpenId();
        }
    }, [initialOpenId, onClearInitialOpenId]);

    // Sincronizar modoFiltro cuando cambia la entrada del menú (ej. de "Buscar por Skills" a "Profesionales")
    useEffect(() => {
        setModoFiltro(modoInicial === 'skills' ? 'skills' : 'texto');
    }, [modoInicial]);

    const agregarSkill = (nombre) => {
        if (!nombre || skillsSeleccionadas.includes(nombre)) return;
        setSkillsSeleccionadas(prev => [...prev, nombre]);
        setSkillQuery('');
    };

    const quitarSkill = (s) =>
        setSkillsSeleccionadas(prev => prev.filter(x => x !== s));

    const buscarPorSkillsHandler = async () => {
        if (!skillsSeleccionadas.length) return;
        setBuscandoSkills(true);
        try {
            const res = await buscarPorSkills(skillsSeleccionadas);
            setResultadosSkills(res.data);
        } finally {
            setBuscandoSkills(false);
        }
    };

    const limpiarBusquedaSkills = () => {
        setSkillsSeleccionadas([]); setResultadosSkills(null);
    };

    // Normalizar resultados de búsqueda por skills: la API devuelve profesional_id y skills_match;
    // la tarjeta espera id, skills (y opcionalmente fecha_carga, ultima_empresa, ultimo_cargo).
    const listaActual = modoFiltro === 'skills' && resultadosSkills
        ? resultadosSkills.map(p => ({
            ...p,
            id: p.profesional_id ?? p.id,
            skills: p.skills_match ?? p.skills ?? [],
          }))
        : profesionales;

    // Vista de edición: mostrar formulario en lugar del listado
    if (editandoId) {
        return (
            <EditarProfesional
                profesionalId={editandoId}
                onClose={() => setEditandoId(null)}
                onSaved={(id) => {
                    setEditandoId(null);
                    setSelectedId(id);
                    cargarProfesionales();
                }}
            />
        );
    }

    const skillsSugeridas = skillQuery.length > 0
        ? skillsCatalogo.filter(s =>
            s.nombre.toLowerCase().includes(skillQuery.toLowerCase()) &&
            !skillsSeleccionadas.includes(s.nombre)
          ).slice(0, 8)
        : [];

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Profesionales</h1>
                <p className="page-subtitle">
                    {modoFiltro === 'skills' && resultadosSkills
                        ? `${resultadosSkills.length} profesionales con las skills seleccionadas`
                        : `${total} profesionales cargados en el sistema`}
                </p>
            </div>

            {/* ── Barra de filtros ── */}
            <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                        className={`btn btn-sm ${modoFiltro === 'texto' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setModoFiltro('texto')}
                    >🔤 Búsqueda general</button>
                    <button
                        className={`btn btn-sm ${modoFiltro === 'skills' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setModoFiltro('skills')}
                    >⚡ Filtrar por Skills</button>
                </div>

                {modoFiltro === 'texto' ? (
                    <div className="search-input-wrap">
                        <span className="search-icon">🔍</span>
                        <input
                            className="input-field"
                            placeholder="Buscar por nombre, empresa, cargo..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                ) : (
                    <div>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input-field"
                                placeholder="Escribe una skill (ej: Java, Angular, Docker)..."
                                value={skillQuery}
                                onChange={(e) => setSkillQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') agregarSkill(skillQuery);
                                }}
                            />
                            {skillsSugeridas.length > 0 && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: 'var(--navy-mid)', border: '1px solid var(--border)',
                                    borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: 'auto',
                                    marginTop: 4,
                                }}>
                                    {skillsSugeridas.map(s => (
                                        <div
                                            key={s.id}
                                            onClick={() => agregarSkill(s.nombre)}
                                            style={{
                                                padding: '8px 14px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between',
                                                fontSize: '0.82rem',
                                                borderBottom: '1px solid var(--border)',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <span>{s.nombre}</span>
                                            <span className={`skill-badge ${s.categoria}`} style={{ fontSize: '0.65rem' }}>
                                                {s.categoria}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {skillsSeleccionadas.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <div className="tag-list">
                                    {skillsSeleccionadas.map(s => (
                                        <span key={s} className="tag">
                                            {s}
                                            <span className="tag-remove" onClick={() => quitarSkill(s)}>✕</span>
                                        </span>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={buscarPorSkillsHandler}
                                        disabled={buscandoSkills}
                                    >
                                        {buscandoSkills
                                            ? <><span className="loader-ring" style={{ width: 14, height: 14 }} /> Buscando...</>
                                            : `🔍 Buscar con ${skillsSeleccionadas.length} skill${skillsSeleccionadas.length > 1 ? 's' : ''}`
                                        }
                                    </button>
                                    <button className="btn btn-outline btn-sm" onClick={limpiarBusquedaSkills}>
                                        Limpiar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Grid de profesionales ── */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                    <span className="loader-ring" style={{ width: 36, height: 36 }} />
                </div>
            ) : listaActual.length === 0 ? (
                <div className="empty-state">
                    <span className="icon">👥</span>
                    <p>No se encontraron profesionales con los criterios indicados</p>
                </div>
            ) : (
                <>
                    <div className="prof-grid">
                        {listaActual.map(p => (
                            <ProfCard key={p.id} prof={p} onClick={() => setSelectedId(p.id)} />
                        ))}
                    </div>

                    {/* Paginación (solo en modo texto) */}
                    {modoFiltro === 'texto' && total > LIMIT && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                            <button
                                className="btn btn-outline btn-sm"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >← Anterior</button>
                            <span style={{ padding: '5px 12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                Página {page} de {Math.ceil(total / LIMIT)}
                            </span>
                            <button
                                className="btn btn-outline btn-sm"
                                disabled={page >= Math.ceil(total / LIMIT)}
                                onClick={() => setPage(p => p + 1)}
                            >Siguiente →</button>
                        </div>
                    )}
                </>
            )}

            {/* Modal detalle */}
            {selectedId && (
                <DetalleProfesional
                    profesionalId={selectedId}
                    onClose={() => setSelectedId(null)}
                    onDeleted={cargarProfesionales}
                    onEdit={(id) => setEditandoId(id)}
                />
            )}
        </div>
    );
}

// ── Tarjeta de profesional ────────────────────────────────────────────
function ProfCard({ prof, onClick }) {
    const initials = prof.nombre.split(' ').map(w => w[0]).slice(0, 2).join('');
    const visibleSkills = (prof.skills || []).slice(0, 4);
    const extra = (prof.skills || []).length - 4;

    return (
        <div className="prof-card" onClick={onClick}>
            <div className="prof-card-avatar">{initials}</div>
            <div className="prof-card-name">{prof.nombre}</div>
            <div className="prof-card-role">
                {prof.ultimo_cargo
                    ? `${prof.ultimo_cargo} · ${prof.ultima_empresa}`
                    : prof.ciudad || '—'}
            </div>

            <div className="prof-card-skills">
                {visibleSkills.map(s => (
                    <span key={s} className="skill-badge otro" style={{ fontSize: '0.68rem' }}>{s}</span>
                ))}
                {extra > 0 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', padding: '3px 6px' }}>
                        +{extra} más
                    </span>
                )}
            </div>

            <div className="prof-card-meta">
                <span>💼 {prof.num_experiencias} experiencia{prof.num_experiencias !== 1 ? 's' : ''}</span>
                <span>{prof.fecha_carga ? new Date(prof.fecha_carga).toLocaleDateString('es-CL') : '—'}</span>
            </div>
        </div>
    );
}
