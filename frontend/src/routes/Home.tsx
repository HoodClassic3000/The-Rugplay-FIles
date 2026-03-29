import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUsersIndex, formatDate } from '../lib/fetch-data';
import { SearchBox } from '../components/SearchBox';
import { ScoreBadge } from '../components/ScoreBadge';
import type { UsersIndex } from '../types';

export function Home() {
    const [data, setData] = useState<UsersIndex | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchUsersIndex()
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                <h2>ACCESSING SECURE MAINFRAME...</h2>
                <p>Retrieving initial dossiers...</p>
            </div>
        );
    }

    const flaggedUsers = data?.users || [];
    const recentUsers = [...flaggedUsers]
        .sort((a, b) => b.overallScore - a.overallScore || new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime())
        .slice(0, 10);

    return (
        <div>
            <header className="dossier-card" style={{ textAlign: 'center' }}>
                <h1 className="dossier-title" style={{ fontSize: '3rem', marginBottom: '10px' }}>
                    THE RUGPLAY FILES
                </h1>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                    
                </p>
                <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'left' }}>
                    <SearchBox placeholder="ENTER SUBJECT ALIAS OR IDENTIFICATION NUMBER..." />
                </div>
            </header>

            {error || flaggedUsers.length === 0 ? (
                <section className="dossier-card" style={{ textAlign: 'center' }}>
                    <div className="dossier-status" style={{ display: 'inline-block', marginBottom: '1rem' }}>
                        DATABASE EMPTY / OFFLINE
                    </div>
                    <p style={{ fontFamily: 'var(--font-mono)' }}>
                        {error
                            ? `SYSTEM ERROR: ${error}`
                            : 'No active records found in local snapshot storage. This might be due to me pressing the delete key by accident or data is still being collected.'}
                    </p>
                </section>
            ) : (
                <>
                    <section className="data-block">
                        <h2 className="official-header" style={{ borderBottom: '3px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
                            Recent Priority Targets
                        </h2>
                        <div className="grid-2">
                            {recentUsers.map(user => (
                                <Link
                                    key={user.userId}
                                    to={`/user/${user.userId}`}
                                    className="dossier-card"
                                    style={{ display: 'block', textDecoration: 'none', marginBottom: '0', padding: '1.5rem', transition: 'transform 0.1s' }}
                                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <div>
                                            <span className="data-label">Subject Alias</span>
                                            <span className="data-value" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                                {user.name || user.username || `UNKNOWN_SUBJECT_${user.userId}`}
                                            </span>
                                        </div>
                                        <ScoreBadge score={user.overallScore} label={user.overallLabel} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '2rem' }}>
                                        <div>
                                            <span className="data-label">Subject ID</span>
                                            <span className="data-value">{user.userId}</span>
                                        </div>
                                        <div>
                                            <span className="data-label">First Recorded</span>
                                            <span className="data-value">{formatDate(user.firstSeen)}</span>
                                        </div>
                                    </div>
                                    {user.clusterId && (
                                        <div style={{ marginTop: '1rem', borderTop: '1px dashed var(--border-color)', paddingTop: '1rem' }}>
                                            <span className="data-label">Known Syndicate Affiliation</span>
                                            <span className="data-value text-red">CLUSTER: {user.clusterId}</span>
                                        </div>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </section>

                    <section className="dossier-card data-block">
                        <div className="dossier-card-header">
                            <h2 className="dossier-title">Database Overview</h2>
                        </div>
                        <div className="grid-3" style={{ textAlign: 'center' }}>
                            <div>
                                <span className="data-label">Subjects</span>
                                <span className="data-value" style={{ fontSize: '2.5rem', color: 'var(--fbi-blue-light)' }}>
                                    {data?.totalUsers || 0}
                                </span>
                            </div>
                            <div>
                                <span className="data-label">Syndicates Identified</span>
                                <span className="data-value text-red" style={{ fontSize: '2.5rem' }}>
                                    {data?.totalClusters || 0}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Link to="/leaderboards" className="btn-action">
                                    Access Full Records →
                                </Link>
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}