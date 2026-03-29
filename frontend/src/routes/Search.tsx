import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchUsersIndex } from '../lib/fetch-data';
import { SearchBox } from '../components/SearchBox';
import { ScoreBadge } from '../components/ScoreBadge';
import type { UsersIndex, PublicUserSummary } from '../types';

export function Search() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    
    const [data, setData] = useState<UsersIndex | null>(null);
    const [loading, setLoading] = useState(true);
    const [filteredUsers, setFilteredUsers] = useState<PublicUserSummary[]>([]);

    useEffect(() => {
        fetchUsersIndex()
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!data || !query) {
            setFilteredUsers([]);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const results = data.users.filter(user => 
            user.username.toLowerCase().includes(lowerQuery) ||
            user.name?.toLowerCase().includes(lowerQuery) ||
            user.userId.toString() === query
        );
        setFilteredUsers(results);
    }, [data, query]);

    if (loading) {
        return (
            <div className="dossier-card" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                <h2>QUERYING DATABASE...</h2>
                <p>Establishing secure connection...</p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1 className="official-header" style={{ borderBottom: '3px solid black', paddingBottom: '0.5rem', marginBottom: '2rem' }}>
                Record Search
            </h1>
            
            <div className="dossier-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <SearchBox placeholder="ENTER SUBJECT ALIAS, NAME, OR SYSTEM ID..." />
            </div>

            {query && (
                <div style={{ fontFamily: 'var(--font-mono)', marginBottom: '1.5rem', borderBottom: '1px solid black', paddingBottom: '0.5rem' }}>
                    
                </div>
            )}

            {filteredUsers.length === 0 && query ? (
                <div className="dossier-card" style={{ textAlign: 'center' }}>
                    <span className="data-label text-red">NO MATCHES FOUND</span>
                    <p style={{ fontFamily: 'var(--font-mono)', marginTop: '0.5rem' }}>
                        The requested alias or ID does not exist in local surveillance logs.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {filteredUsers.map(user => (
                        <Link
                            key={user.userId}
                            to={`/user/${user.userId}`}
                            className="dossier-card"
                            style={{
                                display: 'block',
                                padding: '1.25rem 1.5rem',
                                marginBottom: 0,
                                textDecoration: 'none',
                                transition: 'background-color 0.1s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span className="data-label">Subject Identity</span>
                                    <span className="data-value" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                        {user.name || user.username || `UNKNOWN_SUBJECT_${user.userId}`}
                                    </span>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                        <span className="font-mono text-muted">ID: {user.userId}</span>
                                    </div>
                                </div>
                                <ScoreBadge score={user.overallScore} label={user.overallLabel} />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}