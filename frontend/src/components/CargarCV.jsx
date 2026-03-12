// src/components/CargarCV.jsx
import { useState, useRef } from 'react';
import { cargarCV } from '../services/api';

export default function CargarCV({ onCargaExitosa }) {
    const [file,      setFile]      = useState(null);
    const [estado,    setEstado]    = useState(null); // null | 'uploading' | 'processing' | 'success' | 'error'
    const [progreso,  setProgreso]  = useState(0);
    const [resultado, setResultado] = useState(null);
    const [errorMsg,  setErrorMsg]  = useState('');
    const [dragOver,  setDragOver]  = useState(false);
    const inputRef = useRef();

    const handleFile = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf') {
            setErrorMsg('Solo se aceptan archivos en formato PDF.');
            return;
        }
        if (f.size > 10 * 1024 * 1024) {
            setErrorMsg('El archivo no puede superar 10 MB.');
            return;
        }
        setFile(f);
        setEstado(null);
        setErrorMsg('');
        setResultado(null);
    };

    const handleDrop = (e) => {
        e.preventDefault(); setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };

    const procesar = async () => {
        if (!file) return;
        setEstado('uploading');
        setProgreso(0);

        try {
            const res = await cargarCV(file, (ev) => {
                const pct = Math.round((ev.loaded / ev.total) * 40); // 0-40%: upload
                setProgreso(pct);
                if (pct >= 40) setEstado('processing');
            });

            // Simular progreso del procesamiento IA (40-100%)
            let p = 40;
            const interval = setInterval(() => {
                p = Math.min(p + 6, 95);
                setProgreso(p);
                if (p >= 95) clearInterval(interval);
            }, 400);

            setProgreso(100);
            clearInterval(interval);
            setEstado('success');
            setResultado(res.data);
            setFile(null);
            if (inputRef.current) inputRef.current.value = '';
            onCargaExitosa?.();

        } catch (err) {
            setEstado('error');
            setErrorMsg(err.response?.data?.error || 'Error al procesar el CV');
        }
    };

    const resetear = () => {
        setFile(null); setEstado(null); setProgreso(0);
        setResultado(null); setErrorMsg('');
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Cargar Curriculum Vitae</h1>
                <p className="page-subtitle">
                    Sube un PDF y la IA extraerá automáticamente todos los datos del profesional
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                {/* ── Panel izquierdo: subida ── */}
                <div className="card">
                    <div className="card-title">
                        <span>📄</span> Seleccionar Archivo
                    </div>

                    <div
                        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFile(e.target.files[0])}
                        />
                        <span className="upload-icon">
                            {file ? '📋' : '⬆️'}
                        </span>
                        {file ? (
                            <>
                                <h3>{file.name}</h3>
                                <p>{(file.size / 1024).toFixed(1)} KB — Listo para procesar</p>
                            </>
                        ) : (
                            <>
                                <h3>Arrastra el PDF aquí</h3>
                                <p>o haz clic para seleccionar desde tu equipo</p>
                            </>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="status-msg status-error">
                            ⚠️ {errorMsg}
                        </div>
                    )}

                    {/* Progress */}
                    {(estado === 'uploading' || estado === 'processing') && (
                        <div style={{ marginTop: 16 }}>
                            <div className="status-msg status-loading">
                                <span className="loader-ring" />
                                {estado === 'uploading'
                                    ? 'Subiendo archivo...'
                                    : '🤖 Claude está leyendo y analizando el CV...'}
                            </div>
                            <div className="progress-bar-wrap">
                                <div className="progress-bar" style={{ width: `${progreso}%` }} />
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4, textAlign: 'right' }}>
                                {progreso}%
                            </p>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button
                            className="btn btn-primary"
                            disabled={!file || estado === 'uploading' || estado === 'processing'}
                            onClick={procesar}
                            style={{ flex: 1 }}
                        >
                            {(estado === 'uploading' || estado === 'processing')
                                ? <><span className="loader-ring" /> Procesando...</>
                                : <><span>⚡</span> Procesar con IA</>
                            }
                        </button>
                        {file && (
                            <button className="btn btn-outline" onClick={resetear}>
                                ✕ Cancelar
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Panel derecho: resultado ── */}
                <div>
                    {estado === 'success' && resultado ? (
                        <div className="card">
                            <div className="card-title" style={{ color: 'var(--accent)' }}>
                                ✅ CV Cargado Exitosamente
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: '1.1rem', fontFamily: 'Syne, sans-serif', fontWeight: 700, marginBottom: 4 }}>
                                    {resultado.nombre}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    ID: #{resultado.profesional_id}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                <div style={{ background: 'var(--input-bg)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '1.5rem', fontFamily: 'Syne', fontWeight: 800, color: 'var(--accent)' }}>
                                        {resultado.skills_encontradas}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Skills detectadas</div>
                                </div>
                                <div style={{ background: 'var(--input-bg)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '1.5rem', fontFamily: 'Syne', fontWeight: 800, color: 'var(--accent)' }}>
                                        {resultado.experiencias_encontradas}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Experiencias</div>
                                </div>
                            </div>

                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--input-bg)', borderRadius: 6 }}>
                                📁 Archivo: <span style={{ color: 'var(--text-bright)' }}>{resultado.archivo_guardado}</span>
                            </div>

                            <button className="btn btn-outline" onClick={resetear} style={{ marginTop: 16, width: '100%' }}>
                                + Cargar otro CV
                            </button>
                        </div>
                    ) : (
                        <div className="card" style={{ height: '100%', minHeight: 300 }}>
                            <div className="card-title">💡 Cómo funciona</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {[
                                    ['1', '📤 Sube el PDF', 'Selecciona el CV en formato PDF del profesional desde tu equipo.'],
                                    ['2', '🤖 Análisis con IA', 'Claude lee el PDF completo y extrae todos los datos estructurados automáticamente.'],
                                    ['3', '🗄️ Guardado en BD', 'Los datos se almacenan en PostgreSQL: datos personales, educación, experiencias y skills.'],
                                    ['4', '🔍 Listo para buscar', 'El profesional queda disponible para consultas y filtros por skills.'],
                                ].map(([n, title, desc]) => (
                                    <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 8,
                                            background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.3)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)',
                                            flexShrink: 0,
                                        }}>{n}</div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>{title}</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
