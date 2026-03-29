import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchClusterDetail, formatDate, formatNumber } from '../lib/fetch-data';
import { ScoreBadge } from '../components/ScoreBadge';
import type { PublicClusterDetail } from '../types';

export function ClusterPage() {
    const { clusterId } = useParams<{ clusterId: string }>();
    const [cluster, setCluster] = useState<PublicClusterDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!clusterId) return;
        fetchClusterDetail(clusterId)
            .then(setCluster)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [clusterId]);

    if (loading) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                <h2>RETRIEVING SYNDICATE NETWORK DATA...</h2>
                <p>Decrypting secure records for Cluster ID: {clusterId}</p>
            </div>
        );
    }

    if (error || !cluster) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center' }}>
                <span className="data-label text-red">SYNDICATE RECORD RETRIEVAL FAILED</span>
                <p style={{ fontFamily: 'var(--font-mono)' }}>Error: {error || 'Cluster file not found in available intercepts'}</p>
            </div>
        );
    }

    return (
        <div>
            <Link to="/" style={{ color: 'var(--text-dark)', textDecoration: 'none', marginBottom: '1.5rem', display: 'inline-block', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                [← RETURN TO DATABASE ROOT]
            </Link>

            <header className="dossier-card">
                <h1 className="official-header" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', display: 'inline-block' }}>
                    SYNDICATE NETWORK: {cluster.clusterId}
                </h1>
                <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
                    <div>
                        <span className="data-label">File Created Date</span>
                        <span className="data-value">{formatDate(cluster.createdAt)}</span>
                    </div>
                    <div>
                        <span className="data-label">Last Intel Update</span>
                        <span className="data-value">{formatDate(cluster.updatedAt)}</span>
                    </div>
                </div>
            </header>

            <section className="dossier-card data-block">
                <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    Prime Suspects (Network Owners)
                </h2>
                <div className="grid-2">
                    {cluster.ownerCandidates.map((owner, i) => (
                        <Link
                            key={i}
                            to={`/user/${owner.userId}`}
                            style={{
                                display: 'block',
                                border: '2px solid var(--text-dark)',
                                padding: '1.5rem',
                                textDecoration: 'none',
                                backgroundColor: '#fdfdfd',
                                position: 'relative'
                            }}
                        >
                            <div className="data-label text-red" style={{ position: 'absolute', top: -10, left: 10, background: 'white', padding: '0 5px' }}>
                                TARGET {i + 1}
                            </div>
                            <div className="data-label">Target Alias</div>
                            <div className="data-value" style={{ fontWeight: 'bold', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                                {owner.username || `UNKNOWN_ID_${owner.userId}`}
                            </div>
                            <div className="data-label">Analyst Confidence Score</div>
                            <div className="data-value text-red" style={{ fontWeight: 'bold' }}>
                                {owner.confidence}% PROBABILITY
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="dossier-card data-block">
                <div className="dossier-card-header">
                    <h2 className="dossier-title" style={{ fontSize: '1.5rem' }}>Network Threat Metrics</h2>
                </div>
                <div className="grid-3">
                    <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                        <span className="data-label">Known Aliases (Alts)</span>
                        <span className="data-value text-red" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {cluster.metrics.totalAlts} UNITS
                        </span>
                    </div>
                    <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                        <span className="data-label">Total Value Transferred</span>
                        <span className="data-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {formatNumber(cluster.metrics.totalTransferred)}
                        </span>
                    </div>
                    <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                        <span className="data-label">Estimated Rigged Profits</span>
                        <span className="data-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {formatNumber(cluster.metrics.totalRugProfit)}
                        </span>
                    </div>
                    <div>
                        <span className="data-label">Total Laundered (Arcade)</span>
                        <span className="data-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {formatNumber(cluster.metrics.totalArcadeLaundered)}
                        </span>
                    </div>
                    <div>
                        <span className="data-label">Oldest Known Activity</span>
                        <span className="data-value">{formatDate(cluster.metrics.oldestFirstSeen)}</span>
                    </div>
                    <div>
                        <span className="data-label">Most Recent Intel</span>
                        <span className="data-value">{formatDate(cluster.metrics.newestFirstSeen)}</span>
                    </div>
                </div>
            </section>

            <section className="dossier-card data-block">
                <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    Identified Subordinates / Alternate Identities ({cluster.members.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {cluster.members.map((member, idx) => (
                        <Link
                            key={member.userId}
                            to={`/user/${member.userId}`}
                            style={{
                                display: 'block',
                                padding: '1rem',
                                borderBottom: '1px solid var(--border-light)',
                                textDecoration: 'none',
                                transition: 'background-color 0.1s',
                                backgroundColor: idx % 2 === 0 ? 'var(--bg-paper)' : 'white'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'var(--bg-paper)' : 'white'}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="data-label">Subordinate #{idx + 1}</div>
                                    <div className="data-value" style={{ fontWeight: 'bold' }}>
                                        {member.name || member.username || `UNKNOWN_ID_${member.userId}`}
                                    </div>
                                    <div className="font-mono text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                        SYSTEM ID: {member.userId} 
                                    </div>
                                </div>
                                <ScoreBadge score={member.overallScore} label={member.overallLabel} />
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}