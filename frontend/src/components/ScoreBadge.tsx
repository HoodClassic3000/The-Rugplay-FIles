import type { AltLabel } from '../types';
import { getScoreColor } from '../lib/fetch-data';

interface ScoreBadgeProps {
    score: number;
    label: AltLabel;
}

export function ScoreBadge({ score, label }: ScoreBadgeProps) {
    let rawColor = getScoreColor(label);
    
    let fbiColor = 'var(--text-dark)'; 
    let bgColor = 'var(--bg-paper)';
    
    if (label === 'Unlikely') {
        fbiColor = '#16a34a'; 
        bgColor = '#dcfce7';  
    } else if (label === 'Very Likely' || label === 'Likely') {
        fbiColor = 'var(--fbi-red)';
        bgColor = '#ffebee';
    } else if (label === 'Possible') {
        fbiColor = '#c2410c'; 
        bgColor = '#ffedd5';
    }

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            border: `2px solid ${fbiColor}`,
            backgroundColor: bgColor,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            minWidth: '120px'
        }}>
            <div style={{
                backgroundColor: fbiColor,
                color: 'white',
                padding: '4px 8px',
                fontWeight: 'bold',
                fontSize: '1rem',
                borderRight: `2px solid ${fbiColor}`
            }}>
                {score}
            </div>
            <div style={{
                padding: '4px 8px',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                color: fbiColor,
                letterSpacing: '1px',
                textAlign: 'center',
                flexGrow: 1
            }}>
                {label}
            </div>
        </div>
    );
}