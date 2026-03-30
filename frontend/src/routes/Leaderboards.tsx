import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUsersIndex } from '../lib/fetch-data';
import { ScoreBadge } from '../components/ScoreBadge';
import type { UsersIndex, PublicUserSummary } from '../types';

interface LeaderboardEntry extends PublicUserSummary {
    totalTransferred?: number;
    totalRugProfit?: number;
    clusterTotalAlts?: number;
}

export function Leaderboards() {
    const [data, setData] = useState<UsersIndex | null>(null);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'score' | 'transfers' | 'rugProfit' | 'alts'>('score');

    useEffect(() => {
        fetchUsersIndex()
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                <h2>QUERYING MASTER DATABASE...</h2>
                <p>Compiling Most Wanted listings...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center' }}>
                <span className="data-label text-red">DATABASE OFFLINE</span>
                <p style={{ fontFamily: 'var(--font-mono)' }}>Error loading master records</p>
            </div>
        );
    }

    const clusterSizes = new Map<string, number>();
    data.users.forEach(u => {
        if (u.clusterId) {
            clusterSizes.set(u.clusterId, (clusterSizes.get(u.clusterId) || 0) + 1);
        }
    });

    const getAltsCount = (u: PublicUserSummary) => {
        const ownerClusterId = `cluster_${u.userId}`;
        if (clusterSizes.has(ownerClusterId)) return clusterSizes.get(ownerClusterId)!;
        if (clusterSizes.has(u.userId.toString())) return clusterSizes.get(u.userId.toString())!;
        if (u.clusterId) return clusterSizes.get(u.clusterId)!;
        return 0;
    };

    const filteredUsers = sortBy === 'alts' 
        ? data.users.filter(u => u.isMastermind)
        : data.users;

    const sortedUsers = [...filteredUsers].sort((a, b) => {
        let result: number;
        switch (sortBy) {
            case 'transfers':
                result = ((b as any).totalTransferred || 0) - ((a as any).totalTransferred || 0);
                break;
            case 'rugProfit':
                result = ((b as any).totalRugProfit || 0) - ((a as any).totalRugProfit || 0);
                break;
            case 'alts':
                result = getAltsCount(b) - getAltsCount(a);
                break;
            case 'score':
            default:
                result = b.overallScore - a.overallScore;
        }
        if (result === 0) {
            result = b.userId - a.userId;
        }
        return result;
    });

    const topAlts = sortedUsers.slice(0, 20);

    return (
        <div>
            <Link to="/" style={{ color: 'var(--text-dark)', textDecoration: 'none', marginBottom: '1.5rem', display: 'inline-block', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                [← RETURN TO DATABASE ROOT]
            </Link>

            <header className="dossier-card">
                <h1 className="official-header" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', borderBottom: '2px solid black', paddingBottom: '0.5rem' }}>
                    RUGPLAY'S MOST WANTED
                </h1>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                    
                </p>
                <div style={{ display: 'flex', gap: '12px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setSortBy('score')}
                        className="btn-action"
                        style={{ backgroundColor: sortBy === 'score' ? 'var(--fbi-red)' : 'var(--text-dark)' }}
                    >
                        SORT BY THREAT SCORE
                    </button>
                    <button
                        onClick={() => setSortBy('transfers')}
                        className="btn-action"
                        style={{ backgroundColor: sortBy === 'transfers' ? 'var(--fbi-red)' : 'var(--text-dark)' }}
                    >
                        SORT BY TRANSFERS
                    </button>
                    <button
                        onClick={() => setSortBy('rugProfit')}
                        className="btn-action"
                        style={{ backgroundColor: sortBy === 'rugProfit' ? 'var(--fbi-red)' : 'var(--text-dark)' }}
                    >
                        SORT BY FRAUD PROFIT
                    </button>
                    <button
                        onClick={() => setSortBy('alts')}
                        className="btn-action"
                        style={{ backgroundColor: sortBy === 'alts' ? 'var(--fbi-red)' : 'var(--text-dark)' }}
                    >
                        SORT BY SYNDICATE SIZE
                    </button>
                </div>
            </header>

            <section className="dossier-card data-block">
                <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    TOP 20 TARGETS (RANKED)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {topAlts.map((user, index) => (
                        <Link
                            key={user.userId}
                            to={`/user/${user.userId}`}
                            style={{
                                display: 'block',
                                padding: '1rem',
                                borderBottom: '1px solid var(--border-light)',
                                textDecoration: 'none',
                                transition: 'background-color 0.1s',
                                backgroundColor: index % 2 === 0 ? 'var(--bg-paper)' : 'white'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'var(--bg-paper)' : 'white'}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        border: index < 3 ? '2px solid var(--fbi-red)' : '2px solid var(--text-dark)',
                                        backgroundColor: index < 3 ? '#ffebee' : 'transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontFamily: 'var(--font-mono)',
                                        color: index < 3 ? 'var(--fbi-red)' : 'var(--text-dark)',
                                        fontSize: '1.2rem'
                                    }}>
                                        #{index + 1}
                                    </div>
                                    <div>
                                        <div className="data-value" style={{ fontSize: '1.2rem', fontWeight: 'bold', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                                            {user.name || user.username || `UNKNOWN_ID_${user.userId}`}
                                        </div>
                                        <div className="font-mono text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                            SYSTEM ID: {user.userId}
                                            {user.clusterId && <span className="text-red" style={{ marginLeft: '0.5rem' }}>[{user.clusterId}]</span>}
                                            {getAltsCount(user) > 0 && <span className="text-red" style={{ marginLeft: '0.5rem' }}>({getAltsCount(user)} ALTS)</span>}
                                        </div>
                                    </div>
                                </div>
                                <ScoreBadge score={user.overallScore} label={user.overallLabel} />
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="dossier-card data-block">
                <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    Global Threat Summary
                </h2>
                <div className="grid-3" style={{ textAlign: 'center' }}>
                    <div style={{ borderRight: '1px solid var(--border-light)' }}>
                        <span className="data-label">Total Surveillance Subjects</span>
                        <span className="data-value" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                            {data.totalUsers}
                        </span>
                    </div>
                    <div style={{ borderRight: '1px solid var(--border-light)' }}>
                        <span className="data-label">Active Crime Syndicates</span>
                        <span className="data-value text-red" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                            {data.totalClusters}
                        </span>
                    </div>
                    <div>
                        <span className="data-label">Critical Threat Level (Likely+)</span>
                        <span className="data-value" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--fbi-red)' }}>
                            {data.users.filter(u => u.overallLabel === 'Likely' || u.overallLabel === 'Very Likely').length}
                        </span>
                    </div>
                </div>
            </section>
        </div>
    );
}