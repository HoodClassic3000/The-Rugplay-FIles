import type { PublicRelationshipEntry } from '../types';
import { formatNumber } from '../lib/fetch-data';

interface TransferTableProps {
    relationships: PublicRelationshipEntry[];
}

export function TransferTable({ relationships }: TransferTableProps) {
    if (relationships.length === 0) {
        return (
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                [ NO RECORDED FINANCIAL TRANSFERS TO ASSOCIATES ]
            </div>
        );
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="investigation-table">
                <thead>
                    <tr>
                        <th>Recipient Alias / System ID</th>
                        <th>Nature of Operation</th>
                        <th style={{ textAlign: 'right' }}>Total Transferred Value</th>
                        <th style={{ textAlign: 'right' }}>Suspicion Weight</th>
                    </tr>
                </thead>
                <tbody>
                    {relationships.map((rel, index) => (
                        <tr key={index}>
                            <td style={{ fontWeight: 'bold' }}>
                                {rel.toUsername || `UNKNOWN_ID_${rel.toUserId}`}
                            </td>
                            <td>
                                {rel.type.replace(/_/g, ' ')}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                {formatNumber(rel.totalValueMoved)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                {rel.weight.toFixed(2)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}