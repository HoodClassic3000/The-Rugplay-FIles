import { Link } from 'react-router-dom';

export function Privacy() {
    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <Link to="/" style={{ color: 'var(--text-dark)', textDecoration: 'none', marginBottom: '1.5rem', display: 'inline-block', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                [← RETURN TO DATABASE ROOT]
            </Link>
            <div className="dossier-card">
                <h1 className="official-header" style={{ borderBottom: '3px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    Privacy Policy & Data Removal
                </h1>

                <div style={{ fontFamily: 'var(--font-sans)', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0f0f0', borderLeft: '4px solid var(--fbi-blue)' }}>
                        All data aggregated and displayed within The Rugplay Files is sourced strictly from public information available to any user (including guest users) on the Rugplay platform.
                        No private APIs, authenticated endpoints, or non-public data scraping methods are utilised.
                    </p>

                    <h2 className="official-header" style={{ fontSize: '1.2rem', marginTop: '2.5rem', marginBottom: '1rem' }}>Data Removal Requests</h2>

                    <p style={{ marginBottom: '1.5rem' }}>
                        If you believe your account has been erroneously flagged by our automated analysis, or if you wish to have your public data removed from this specific database index, you may submit a formal request through the following channels:
                    </p>

                    <ul style={{ listStyleType: 'none', paddingLeft: '0', marginBottom: '1.5rem' }}>
                        <li style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border-light)' }}>
                            <strong style={{ fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.25rem', color: 'var(--fbi-blue)' }}>CHANNEL 1: SECURE DIRECT MESSAGE</strong>
                            Direct message the RBI Director at <strong>@hoodclassics_13562</strong> on Discord.
                        </li>
                        <li style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border-light)' }}>
                            <strong style={{ fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '0.25rem', color: 'var(--fbi-blue)' }}>CHANNEL 2: PUBLIC GITHUB ISSUE</strong>
                            Open an Issue on the official repository outlining the removal request and providing your System ID.
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
