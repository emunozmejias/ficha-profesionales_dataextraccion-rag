// src/App.js
import { useState } from 'react';
import './index.css';

import Dashboard     from './pages/Dashboard';
import Profesionales from './pages/Profesionales';
import CargarCV      from './components/CargarCV';
import BusquedaIA    from './pages/BusquedaIA';

const NAV_ITEMS = [
    { id: 'dashboard',      icon: '◈',  label: 'Panel Principal' },
    { id: 'profesionales',  icon: '👥', label: 'Profesionales' },
    { id: 'cargar',         icon: '📤', label: 'Cargar CV' },
    { id: 'buscar',         icon: '🔍', label: 'Buscar por Skills' },
    { id: 'busqueda-ia',    icon: '🤖', label: 'Búsqueda IA' },
];

export default function App() {
    const [pagina, setPagina] = useState('dashboard');
    const [refreshKey, setRefreshKey] = useState(0);
    const [initialOpenId, setInitialOpenId] = useState(null);

    const navegar = (p) => setPagina(p);

    const verProfesionalDesdeBusqueda = (profesionalId) => {
        setInitialOpenId(profesionalId);
        setPagina('profesionales');
    };

    const renderPage = () => {
        switch (pagina) {
            case 'dashboard':
                return <Dashboard onNavegar={navegar} key={refreshKey} />;
            case 'profesionales':
                return (
                    <Profesionales
                        key={refreshKey}
                        modoInicial="texto"
                        initialOpenId={initialOpenId}
                        onClearInitialOpenId={() => setInitialOpenId(null)}
                    />
                );
            case 'cargar':
                return (
                    <CargarCV
                        onCargaExitosa={() => setRefreshKey(k => k + 1)}
                    />
                );
            case 'buscar':
                return (
                    <Profesionales
                        key={refreshKey}
                        modoInicial="skills"
                    />
                );
            case 'busqueda-ia':
                return <BusquedaIA onVerProfesional={verProfesionalDesdeBusqueda} key={refreshKey} />;
            default:
                return <Dashboard onNavegar={navegar} />;
        }
    };

    return (
        <div className="app-shell">
            {/* ── Sidebar ── */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <h1>Ficha de<br />Profesionales</h1>
                    <span>Sistema RR.HH.</span>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section-label">Navegación</div>
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.id}
                            className={`nav-item ${pagina === item.id ? 'active' : ''}`}
                            onClick={() => navegar(item.id)}
                        >
                            <span className="icon">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* Footer del sidebar */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid var(--border)',
                    fontSize: '0.68rem',
                    color: 'var(--text-dim)',
                    lineHeight: 1.6,
                }}>
                    <div style={{ marginBottom: 4 }}>Powered by</div>
                    <div style={{ color: 'var(--accent)', fontWeight: 600 }}>Claude AI · Anthropic</div>
                    <div>PostgreSQL 16 · Node.js</div>
                </div>
            </aside>

            {/* ── Contenido principal ── */}
            <main className="main-content">
                {renderPage()}
            </main>
        </div>
    );
}
