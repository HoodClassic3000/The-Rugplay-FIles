import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchUserDetail, fetchClusterDetail, formatDate, formatNumber } from '../lib/fetch-data';
import { ScoreBadge } from '../components/ScoreBadge';
import { AltReasonsList } from '../components/AltReasonsList';
import { TransferTable } from '../components/TransferTable';
import type { PublicUserDetail, PublicClusterDetail } from '../types';

export function UserPage() {
    const { userId } = useParams<{ userId: string }>();
    const [user, setUser] = useState<PublicUserDetail | null>(null);
    const [ownedCluster, setOwnedCluster] = useState<PublicClusterDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) return;
        const id = parseInt(userId, 10);
        if (isNaN(id)) {
            setError('Invalid subject ID format');
            setLoading(false);
            return;
        }

        
        setOwnedCluster(null);
        setLoading(true);
        setError(null);

        fetchUserDetail(id)
            .then(u => {
                setUser(u);

                
                fetchClusterDetail(`cluster_${userId}`)
                    .then(c => {
                        setOwnedCluster(c);
                    })
                    .catch(() => {
                        
                    });
            })
            .catch(err => {
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, [userId]);

    if (loading) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                <h2>RETRIEVING SUBJECT DOSSIER...</h2>
                <p>Decrypting secure records for ID: {userId}</p>
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center' }}>
                <span className="data-label text-red">RECORD RETRIEVAL FAILED</span>
                <p style={{ fontFamily: 'var(--font-mono)' }}>Error: {error || 'Subject dossier not found in available intercepts'}</p>
            </div>
        );
    }

    const isClean = user.overallLabel === 'Unlikely' || user.overallScore === 0;

    return (
        <div>
            <Link to="/" style={{ color: 'var(--text-dark)', textDecoration: 'none', marginBottom: '1.5rem', display: 'inline-block', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                [← RETURN TO DATABASE ROOT]
            </Link>

            <header className="dossier-card" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
                    <ScoreBadge score={user.overallScore} label={user.overallLabel} />
                </div>

                {user.isBanned && (
                    <div className="dossier-status" style={{ position: 'absolute', top: '70px', right: '20px' }}>
                        ACCOUNT TERMINATED
                    </div>
                )}

                <h1 className="official-header" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', display: 'inline-block' }}>
                    {isClean ? 'USER PROFILE' : 'SUBJECT DOSSIER'}
                </h1>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2rem', marginTop: '1.5rem' }}>
                    <div style={{ border: '3px solid black', padding: '4px', background: '#ccc' }}>
                        <img
                            src={user.avatarUrl || '/mugshot.jpg'}
                            alt={user.username}
                            onError={(e) => { (e.target as HTMLImageElement).src = '/mugshot.jpg'; }}
                            style={{ width: '120px', height: '120px', display: 'block', filter: 'grayscale(100%) contrast(1.2)', objectFit: 'cover' }}
                        />
                    </div>

                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <span className="data-label">{isClean ? 'Primary Alias / Username' : 'Primary Alias'}</span>
                            <span className="data-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {user.name || user.username || `UNKNOWN_SUBJECT_${user.userId}`}
                            </span>
                        </div>
                        <div>
                            <span className="data-label">{isClean ? 'Platform User ID' : 'System Identification Number'}</span>
                            <span className={`data-value ${isClean ? '' : 'text-red'}`} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                {user.userId}
                            </span>
                        </div>
                        <div>
                            <span className="data-label">Account Creation Date</span>
                            <span className="data-value">{user.createdAt ? formatDate(user.createdAt) : 'UNAVAILABLE'}</span>
                        </div>
                        <div>
                            <span className="data-label">First Signal Intercept</span>
                            <span className="data-value">{formatDate(user.firstSeen)}</span>
                        </div>
                        {user.clusterId && !ownedCluster && (
                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <span className="data-label text-red">WARNING: SYNDICATE AFFILIATION DETECTED</span>
                                <Link to={`/cluster/${user.clusterId}`} className="data-value text-red" style={{ fontWeight: 'bold', display: 'inline-block', border: '1px solid var(--fbi-red)', padding: '4px 8px', background: '#ffebee', textDecoration: 'none' }}>
                                    VIEW CLUSTER FILE: {user.clusterId} →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {ownedCluster && (
                <section className="dossier-card data-block" style={{ border: '3px solid var(--fbi-red)', backgroundColor: '#fff5f5' }}>
                    <h2 className="official-header text-red" style={{ fontSize: '1.25rem', borderBottom: '2px solid var(--fbi-red)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                        SUSPECTED SYNDICATE MASTERMIND
                    </h2>
                    <p style={{ fontFamily: 'var(--font-mono)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                        Subject is the primary orchestrator of a known money laundering syndicate containing <strong>{ownedCluster.metrics.totalAlts}</strong> subordinate identities.
                    </p>

                    <div className="grid-3" style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--fbi-red)' }}>
                        <div>
                            <span className="data-label text-red">Total Laundered Value</span>
                            <span className="data-value font-mono text-red" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {formatNumber(ownedCluster.metrics.totalTransferred)}
                            </span>
                        </div>
                        <div>
                            <span className="data-label text-red">Subordinate Arcade Prints</span>
                            <span className="data-value font-mono text-red" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {formatNumber(ownedCluster.metrics.totalArcadeLaundered)}
                            </span>
                        </div>
                        <div>
                            <span className="data-label text-red">Total Rigged Profits</span>
                            <span className="data-value font-mono text-red" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {formatNumber(ownedCluster.metrics.totalRugProfit)}
                            </span>
                        </div>
                    </div>

                    <h3 className="data-label text-red" style={{ fontSize: '1rem', marginBottom: '1rem' }}>KNOWN SUBORDINATE ALIASES (ALTS)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                        {ownedCluster.members.map((member) => (
                            <Link
                                key={member.userId}
                                to={`/user/${member.userId}`}
                                style={{
                                    display: 'block',
                                    border: '1px solid var(--border-color)',
                                    padding: '1rem',
                                    textDecoration: 'none',
                                    backgroundColor: 'white'
                                }}
                            >
                                <div className="data-value" style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                    {member.name || member.username || `UNKNOWN_ID_${member.userId}`}
                                </div>
                                <div className="font-mono text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                    ID: {member.userId}
                                </div>
                                <ScoreBadge score={member.overallScore} label={member.overallLabel} />
                            </Link>
                        ))}
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--fbi-red)' }}>
                        <Link to={`/cluster/${ownedCluster.clusterId}`} className="btn-action" style={{ backgroundColor: 'var(--fbi-red)' }}>
                            ACCESS FULL SYNDICATE FILE →
                        </Link>
                    </div>
                </section>
            )}

            {user.suspectedOwners && user.suspectedOwners.length > 0 && !ownedCluster && (
                <section className="dossier-card data-block">
                    <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                        Suspected Masterminds (Owners)
                    </h2>
                    <div className="grid-2">
                        {user.suspectedOwners.map((owner, i) => (
                            <Link
                                key={i}
                                to={`/user/${owner.userId}`}
                                style={{
                                    display: 'block',
                                    border: '2px dashed var(--text-dark)',
                                    padding: '1rem',
                                    textDecoration: 'none',
                                    backgroundColor: 'var(--bg-paper)'
                                }}
                            >
                                <div className="data-label">Primary Suspect Link</div>
                                <div className="data-value" style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                                    {owner.username || `SUBJECT_ID_${owner.userId}`}
                                </div>
                                <div className="data-label">Analyst Confidence Score</div>
                                <div className="data-value text-red" style={{ fontWeight: 'bold' }}>
                                    {owner.confidence}% PROBABILITY
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <section className="dossier-card data-block">
                {isClean && user.indicators.length === 0 ? (
                    <>
                        <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem', color: '#16a34a' }}>
                            Verified Good Citizen... SO FAR.
                        </h2>
                        <div style={{ fontFamily: 'var(--font-mono)', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                            No threat indicators or suspicious patterns detected on this profile. As far as we know anyway!
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                            Evidence Log: Threat Indicators ({user.indicators.length})
                        </h2>
                        <AltReasonsList indicators={user.indicators} />
                    </>
                )}
            </section>

            {user.relationships && user.relationships.length > 0 && (
                <section className="dossier-card data-block">
                    <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                        Known Associates & Asset Transfers
                    </h2>
                    <TransferTable relationships={user.relationships} />
                </section>
            )}

            {user.stats && (
                <section className="dossier-card data-block">
                    <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                        {isClean ? 'Financial Overview' : 'Financial Intelligence (FININT)'}
                    </h2>
                    <div className="grid-3">
                        <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                            <span className="data-label">Liquid Assets (Balance)</span>
                            <span className="data-value">{formatNumber(user.stats.baseCurrencyBalance)}</span>
                        </div>
                        <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                            <span className="data-label">Gross Acquisition Volume</span>
                            <span className="data-value">{formatNumber(user.stats.totalBuyVolume)}</span>
                        </div>
                        <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
                            <span className="data-label">Gross Liquidation Volume</span>
                            <span className="data-value">{formatNumber(user.stats.totalSellVolume)}</span>
                        </div>
                        <div>
                            <span className="data-label">Estimated Net Worth</span>
                            <span className="data-value" style={{ fontWeight: 'bold' }}>{formatNumber(user.stats.totalPortfolioValue)}</span>
                        </div>
                        <div>
                            <span className="data-label">Unique Asset Holdings</span>
                            <span className="data-value">{user.stats.holdingsCount}</span>
                        </div>
                        <div>
                            <span className="data-label">Total Recorded Transactions</span>
                            <span className="data-value">{user.stats.totalTransactions}</span>
                        </div>
                    </div>
                </section>
            )}

            {user.arcade && (
                <section className="dossier-card data-block">
                    <h2 className="official-header" style={{ fontSize: '1.25rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                        {isClean ? 'Arcade Statistics' : 'Illicit Gambling / Money Laundering Records (Arcade)'}
                    </h2>
                    <div className="grid-3">
                        <div>
                            <span className="data-label">Total Illicit Gains</span>
                            <span className="data-value text-green" style={{ fontWeight: 'bold' }}>
                                +{formatNumber(user.arcade.arcadeWins)}
                            </span>
                        </div>
                        <div>
                            <span className="data-label">Total Laundered Losses</span>
                            <span className="data-value text-red" style={{ fontWeight: 'bold' }}>
                                -{formatNumber(user.arcade.arcadeLosses)}
                            </span>
                        </div>
                        <div>
                            <span className="data-label">Operations Executed</span>
                            <span className="data-value">{user.arcade.sessionGamesPlayed} ROUNDS</span>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}