// src/pages/EditarProfesional.jsx
import { useState, useEffect } from 'react';
import { getProfesionalById, updateProfesional, getSkillsCatalogo } from '../services/api';

const NIVELES = ['Ingeniería', 'Técnico', 'Postgrado', 'Diplomado', 'Certificación', 'Otro'];
const ESTADOS_CERT = ['completado', 'en_curso'];

function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export default function EditarProfesional({ profesionalId, onClose, onSaved }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [skillsCatalogo, setSkillsCatalogo] = useState([]);

    useEffect(() => {
        if (!profesionalId) return;
        setLoading(true);
        setError(null);
        Promise.all([
            getProfesionalById(profesionalId).then(r => r.data),
            getSkillsCatalogo().then(r => r.data),
        ])
            .then(([prof, catalog]) => {
                setSkillsCatalogo(catalog);
                setData(buildFormState(prof));
                setLoading(false);
            })
            .catch(() => {
                setError('No se pudo cargar el profesional');
                setLoading(false);
            });
    }, [profesionalId]);

    function buildFormState(prof) {
        return {
            nombre: prof.nombre || '',
            rut: prof.rut || '',
            email: prof.email || '',
            telefono: prof.telefono || '',
            ciudad: prof.ciudad || '',
            resumen: prof.resumen || '',
            educacion: (prof.educacion || []).map(e => ({
                institucion: e.institucion || '',
                titulo: e.titulo || '',
                anio_egreso: e.anio_egreso || '',
                nivel: e.nivel || 'Otro',
            })),
            certificaciones: (prof.certificaciones || []).map(c => ({
                nombre: c.nombre || '',
                institucion: c.institucion || '',
                anio: c.anio || '',
                estado: c.estado || 'completado',
            })),
            experiencias: (prof.experiencias || []).map(ex => ({
                empresa: ex.empresa || '',
                cargo: ex.cargo || '',
                fecha_inicio: formatDateForInput(ex.fecha_inicio),
                fecha_fin: formatDateForInput(ex.fecha_fin),
                es_actual: !!ex.es_actual,
                descripcion: ex.descripcion || '',
                skills: Array.isArray(ex.skills) ? [...ex.skills.filter(Boolean)] : [],
            })),
            skills: (prof.skills || []).map(s => ({ nombre: s.nombre || '', categoria: s.categoria || 'otro' })),
        };
    }

    const updateField = (field, value) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const updateArray = (key, index, field, value) => {
        setData(prev => {
            const arr = [...(prev[key] || [])];
            arr[index] = { ...arr[index], [field]: value };
            return { ...prev, [key]: arr };
        });
    };

    const addRow = (key, emptyItem) => {
        setData(prev => ({ ...prev, [key]: [...(prev[key] || []), emptyItem] }));
    };

    const removeRow = (key, index) => {
        setData(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
    };

    const addSkillFromCatalog = (nombre) => {
        const cat = skillsCatalogo.find(s => s.nombre === nombre);
        const categoria = cat ? cat.categoria : 'otro';
        if (data.skills.some(s => s.nombre === nombre)) return;
        setData(prev => ({ ...prev, skills: [...prev.skills, { nombre, categoria }] }));
    };

    const removeSkill = (index) => {
        setData(prev => ({ ...prev, skills: prev.skills.filter((_, i) => i !== index) }));
    };

    const addSkillToExperiencia = (expIndex, skillNombre) => {
        if (!skillNombre?.trim()) return;
        const exp = data.experiencias[expIndex];
        const skills = exp.skills || [];
        if (skills.includes(skillNombre.trim())) return;
        updateArray('experiencias', expIndex, 'skills', [...skills, skillNombre.trim()]);
    };

    const removeSkillFromExperiencia = (expIndex, skillIndex) => {
        const exp = data.experiencias[expIndex];
        const skills = exp.skills.filter((_, i) => i !== skillIndex);
        updateArray('experiencias', expIndex, 'skills', skills);
    };

    const buildPayload = () => ({
        nombre: data.nombre.trim(),
        rut: data.rut.trim() || null,
        email: data.email.trim() || null,
        telefono: data.telefono.trim() || null,
        ciudad: data.ciudad.trim() || null,
        resumen: data.resumen.trim() || null,
        educacion: data.educacion.filter(e => e.institucion.trim() || e.titulo.trim()).map(e => ({
            institucion: e.institucion.trim(),
            titulo: e.titulo.trim(),
            anio_egreso: e.anio_egreso ? parseInt(e.anio_egreso, 10) : null,
            nivel: e.nivel || 'Otro',
        })),
        certificaciones: data.certificaciones.filter(c => c.nombre.trim()).map(c => ({
            nombre: c.nombre.trim(),
            institucion: c.institucion.trim() || null,
            anio: c.anio ? parseInt(c.anio, 10) : null,
            estado: c.estado || 'completado',
        })),
        experiencias: data.experiencias.filter(ex => ex.empresa.trim() || ex.cargo.trim()).map(ex => ({
            empresa: ex.empresa.trim(),
            cargo: ex.cargo.trim(),
            fecha_inicio: ex.fecha_inicio || null,
            fecha_fin: ex.fecha_fin || null,
            es_actual: !!ex.es_actual,
            descripcion: ex.descripcion.trim() || null,
            skills: (ex.skills || []).filter(Boolean),
        })),
        skills: data.skills.filter(s => s.nombre.trim()).map(s => ({
            nombre: s.nombre.trim(),
            categoria: s.categoria || 'otro',
        })),
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!data.nombre.trim()) {
            setError('El nombre es obligatorio');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await updateProfesional(profesionalId, buildPayload());
            onSaved?.(profesionalId);
            onClose?.();
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    if (!profesionalId) return null;
    if (loading) {
        return (
            <div className="card" style={{ padding: 60, textAlign: 'center' }}>
                <span className="loader-ring" style={{ width: 36, height: 36 }} />
                <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Cargando ficha...</p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="card" style={{ padding: 40 }}>
                <p style={{ color: 'var(--accent-2)' }}>{error || 'No se pudo cargar'}</p>
                <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={onClose}>
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h1 className="page-title">Editar ficha</h1>
                <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
                    ← Volver sin guardar
                </button>
            </div>

            <form onSubmit={handleSubmit} className="card" style={{ padding: 24, maxWidth: 720 }}>
                {error && (
                    <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,107,107,0.1)', borderRadius: 8, color: 'var(--accent-2)' }}>
                        {error}
                    </div>
                )}

                {/* Datos personales */}
                <section className="detail-section" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 16 }}>Datos personales</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">Nombre *</label>
                            <input
                                className="input-field"
                                value={data.nombre}
                                onChange={e => updateField('nombre', e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="input-label">RUT</label>
                            <input className="input-field" value={data.rut} onChange={e => updateField('rut', e.target.value)} />
                        </div>
                        <div>
                            <label className="input-label">Email</label>
                            <input className="input-field" type="email" value={data.email} onChange={e => updateField('email', e.target.value)} />
                        </div>
                        <div>
                            <label className="input-label">Teléfono</label>
                            <input className="input-field" value={data.telefono} onChange={e => updateField('telefono', e.target.value)} />
                        </div>
                        <div>
                            <label className="input-label">Ciudad</label>
                            <input className="input-field" value={data.ciudad} onChange={e => updateField('ciudad', e.target.value)} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">Resumen / perfil</label>
                            <textarea
                                className="input-field"
                                rows={4}
                                value={data.resumen}
                                onChange={e => updateField('resumen', e.target.value)}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>
                </section>

                {/* Skills */}
                <section className="detail-section" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 12 }}>Skills</h3>
                    <div style={{ marginBottom: 10 }}>
                        <select
                            className="input-field"
                            style={{ maxWidth: 280 }}
                            onChange={e => {
                                const v = e.target.value;
                                if (v) { addSkillFromCatalog(v); e.target.value = ''; }
                            }}
                        >
                            <option value="">Agregar skill del catálogo...</option>
                            {skillsCatalogo
                                .filter(s => !data.skills.some(sk => sk.nombre === s.nombre))
                                .map(s => (
                                    <option key={s.id} value={s.nombre}>{s.nombre} ({s.categoria})</option>
                                ))}
                        </select>
                    </div>
                    <div className="tag-list" style={{ flexWrap: 'wrap' }}>
                        {data.skills.map((s, i) => (
                            <span key={i} className="tag">
                                {s.nombre}
                                <span className="tag-remove" onClick={() => removeSkill(i)}>✕</span>
                            </span>
                        ))}
                    </div>
                </section>

                {/* Educación */}
                <section className="detail-section" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>Educación</h3>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => addRow('educacion', { institucion: '', titulo: '', anio_egreso: '', nivel: 'Otro' })}>
                            + Añadir
                        </button>
                    </div>
                    {data.educacion.map((e, i) => (
                        <div key={i} className="card" style={{ padding: 14, marginBottom: 10, background: 'var(--navy-mid)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'start' }}>
                                <input className="input-field" placeholder="Institución" value={e.institucion} onChange={ev => updateArray('educacion', i, 'institucion', ev.target.value)} />
                                <input className="input-field" placeholder="Título" value={e.titulo} onChange={ev => updateArray('educacion', i, 'titulo', ev.target.value)} />
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => removeRow('educacion', i)}>Quitar</button>
                                <input className="input-field" type="number" placeholder="Año egreso" value={e.anio_egreso} onChange={ev => updateArray('educacion', i, 'anio_egreso', ev.target.value)} />
                                <select className="input-field" value={e.nivel} onChange={ev => updateArray('educacion', i, 'nivel', ev.target.value)}>
                                    {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <span />
                            </div>
                        </div>
                    ))}
                </section>

                {/* Certificaciones */}
                <section className="detail-section" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>Certificaciones</h3>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => addRow('certificaciones', { nombre: '', institucion: '', anio: '', estado: 'completado' })}>
                            + Añadir
                        </button>
                    </div>
                    {data.certificaciones.map((c, i) => (
                        <div key={i} className="card" style={{ padding: 14, marginBottom: 10, background: 'var(--navy-mid)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'center' }}>
                                <input className="input-field" placeholder="Nombre" value={c.nombre} onChange={ev => updateArray('certificaciones', i, 'nombre', ev.target.value)} />
                                <input className="input-field" placeholder="Institución" value={c.institucion} onChange={ev => updateArray('certificaciones', i, 'institucion', ev.target.value)} />
                                <input className="input-field" type="number" placeholder="Año" value={c.anio} onChange={ev => updateArray('certificaciones', i, 'anio', ev.target.value)} style={{ width: 80 }} />
                                <select className="input-field" value={c.estado} onChange={ev => updateArray('certificaciones', i, 'estado', ev.target.value)} style={{ width: 120 }}>
                                    {ESTADOS_CERT.map(est => <option key={est} value={est}>{est === 'en_curso' ? 'En curso' : 'Completado'}</option>)}
                                </select>
                                <button type="button" className="btn btn-outline btn-sm" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => removeRow('certificaciones', i)}>Quitar</button>
                            </div>
                        </div>
                    ))}
                </section>

                {/* Experiencias */}
                <section className="detail-section" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>Experiencia laboral</h3>
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => addRow('experiencias', { empresa: '', cargo: '', fecha_inicio: '', fecha_fin: '', es_actual: false, descripcion: '', skills: [] })}
                        >
                            + Añadir
                        </button>
                    </div>
                    {data.experiencias.map((ex, i) => (
                        <div key={i} className="card" style={{ padding: 16, marginBottom: 14, background: 'var(--navy-mid)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <strong>Experiencia {i + 1}</strong>
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => removeRow('experiencias', i)}>Quitar</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <input className="input-field" placeholder="Empresa" value={ex.empresa} onChange={ev => updateArray('experiencias', i, 'empresa', ev.target.value)} />
                                <input className="input-field" placeholder="Cargo" value={ex.cargo} onChange={ev => updateArray('experiencias', i, 'cargo', ev.target.value)} />
                                <input className="input-field" type="month" placeholder="Inicio" value={ex.fecha_inicio} onChange={ev => updateArray('experiencias', i, 'fecha_inicio', ev.target.value)} />
                                <input className="input-field" type="month" placeholder="Fin" value={ex.fecha_fin} onChange={ev => updateArray('experiencias', i, 'fecha_fin', ev.target.value)} disabled={ex.es_actual} />
                                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={ex.es_actual} onChange={ev => updateArray('experiencias', i, 'es_actual', ev.target.checked)} />
                                        Trabajo actual
                                    </label>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <textarea className="input-field" rows={2} placeholder="Descripción" value={ex.descripcion} onChange={ev => updateArray('experiencias', i, 'descripcion', ev.target.value)} style={{ resize: 'vertical' }} />
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Skills en esta experiencia</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                    {(ex.skills || []).map((sk, skIdx) => (
                                        <span key={skIdx} className="tag">
                                            {sk}
                                            <span className="tag-remove" onClick={() => removeSkillFromExperiencia(i, skIdx)}>✕</span>
                                        </span>
                                    ))}
                                    <select
                                        className="input-field"
                                        style={{ width: 160, height: 28, fontSize: '0.8rem' }}
                                        onChange={e => { const v = e.target.value; if (v) { addSkillToExperiencia(i, v); e.target.value = ''; } }}
                                    >
                                        <option value="">+ Skill...</option>
                                        {skillsCatalogo.map(s => (
                                            <option key={s.id} value={s.nombre}>{s.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>

                <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? <>Guardando...</> : 'Guardar cambios'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    );
}
