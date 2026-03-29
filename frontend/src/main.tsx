import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home } from './routes/Home';
import { Search } from './routes/Search';
import { UserPage } from './routes/UserPage';
import { ClusterPage } from './routes/ClusterPage';
import { Leaderboards } from './routes/Leaderboards';
import { Methodology } from './routes/Methodology';
import { TermsOfService } from './routes/Terms';
import { Privacy } from './routes/Privacy';
import './index.css';

console.log('main.tsx: Starting...');

function Navigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    return (
        <header>
            <div className="classification-banner">
                // UNCLASSIFIED / PUBLIC RECORD // FOR OFFICIAL INVESTIGATIVE USE ONLY //
            </div>

            <nav className="nav-container">
                <Link to="/" className="nav-brand">
                    <img src="/RFlogo.png" alt="RF Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                    The Rugplay Files
                </Link>

                <div className="nav-links">
                    <form onSubmit={handleSearch} className="search-form">
                        <input
                            type="text"
                            placeholder="SEARCH SUBJECT DATABASE..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                        <button type="submit" className="search-button">Search</button>
                    </form>

                    <Link
                        to="/leaderboards"
                        className={`nav-link ${location.pathname === '/leaderboards' ? 'active' : ''}`}
                    >
                        Leaderboards
                    </Link>
                </div>
            </nav>
        </header>
    );
}

function App() {
    console.log('App rendering');
    return (
        <BrowserRouter>
            <Navigation />
            <main className="main-content" style={{ minHeight: '60vh' }}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/user/:userId" element={<UserPage />} />
                    <Route path="/cluster/:clusterId" element={<ClusterPage />} />
                    <Route path="/leaderboards" element={<Leaderboards />} />
                    <Route path="/methodology" element={<Methodology />} />
                    <Route path="/tos" element={<TermsOfService />} />
                    <Route path="/privacy" element={<Privacy />} />
                </Routes>
            </main>
            
            <footer style={{ marginTop: 'auto', padding: '3rem 0 4rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    <Link to="/methodology" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 'bold' }}>[ METHODOLOGY ]</Link>
                    <Link to="/tos" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 'bold' }}>[ TERMS & DISCLAIMER ]</Link>
                    <Link to="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 'bold' }}>[ PRIVACY & REMOVAL ]</Link>
                </div>
                <div className="classification-banner" style={{ position: 'fixed', bottom: 0, width: '100%', borderTop: '2px solid black', borderBottom: 'none' }}>
                    
                </div>
            </footer>
        </BrowserRouter>
    );
}

console.log('main.tsx: About to mount React');

const rootElement = document.getElementById('root');
if (!rootElement) {
    console.error('main.tsx: No root element found!');
    throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

console.log('main.tsx: React mounted');