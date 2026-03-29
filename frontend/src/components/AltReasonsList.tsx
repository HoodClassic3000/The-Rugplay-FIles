import type { PublicAltIndicator } from '../types';

interface AltReasonsListProps {
    indicators: PublicAltIndicator[];
}

export function AltReasonsList({ indicators }: AltReasonsListProps) {
    if (indicators.length === 0) {
        return (
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                [ NO THREAT INDICATORS DETECTED ON FILE ]
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {indicators.map((indicator, index) => (
                <div
                    key={index}
                    style={{
                        padding: '1rem',
                        border: '2px solid var(--border-color)',
                        backgroundColor: '#fff',
                        position: 'relative'
                    }}
                >
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '4px',
                        height: '100%',
                        backgroundColor: 'var(--fbi-red)'
                    }} />
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem',
                        paddingLeft: '1rem'
                    }}>
                        <span className="data-label" style={{ margin: 0, color: 'var(--fbi-red)', fontSize: '0.9rem' }}>
                            VIOLATION TYPE: {indicator.type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono" style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                            +{indicator.score} PTS
                        </span>
                    </div>
                    <p style={{
                        margin: 0,
                        paddingLeft: '1rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        color: 'var(--text-dark)'
                    }}>
                        {indicator.summary}
                    </p>
                    {indicator.candidateMainUserId && (
                        <div style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            marginLeft: '1rem',
                            borderTop: '1px dashed var(--border-light)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            color: 'var(--fbi-blue)'
                        }}>
                            &gt; SUSPECTED INTEL DIRECTOR: ID #{indicator.candidateMainUserId}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}