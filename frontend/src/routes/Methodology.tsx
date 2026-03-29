import { Link } from 'react-router-dom';

export function Methodology() {
    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <Link to="/" style={{ color: 'var(--text-dark)', textDecoration: 'none', marginBottom: '1.5rem', display: 'inline-block', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                [← RETURN TO DATABASE ROOT]
            </Link>
            <div className="dossier-card">
                <h1 className="official-header" style={{ borderBottom: '3px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    Investigation Methodology & Detection Strategy
                </h1>
                <div style={{ fontFamily: 'var(--font-sans)', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '1rem' }}>
                        The Rugplay Bureau of Investigation employs a multi-signal scoring algorithm to detect and cluster suspected alt accounts operating within the Rugplay ecosystem.
                        Our strategy relies on analysing public transaction and behavioural patterns to identify coordinated money laundering and market manipulation syndicates.
                    </p>
                    <h2 className="official-header" style={{ fontSize: '1.1rem', marginTop: '2.5rem', marginBottom: '1rem', color: 'var(--fbi-red)' }}>
                        Core Threat Indicators
                    </h2>
                    <ul style={{ paddingLeft: '2rem', marginBottom: '1.5rem' }}>
                        <li style={{ marginBottom: '1rem' }}>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>CASH FUNNELLING:</strong> 
                            <br/>Rapid liquidation of assets and funnelling of base currency (Cash) to a centralised mastermind account. High frequency transfers with no return value.
                        </li>
                        <li style={{ marginBottom: '1rem' }}>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>RUG LAUNDERING:</strong> 
                            <br/>Coordinated, "all-in" purchases of tokens created by a mastermind account. The alt intentionally holds the token to zero, transferring illicit wealth to the creator unharmed.
                        </li>
                        <li style={{ marginBottom: '1rem' }}>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>ARCADE LAUNDERING:</strong> 
                            <br/>Exploiting arcade minigames to transfer wealth. Statistically impossible win/loss ratios across paired accounts under the guise of randomised losses.
                        </li>
                        <li style={{ marginBottom: '1rem' }}>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>SINGLE-CREATOR BUYER:</strong> 
                            <br/>Accounts that exhibit no organic trading behaviour and exclusively purchase assets minted by a specific organiser.
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
