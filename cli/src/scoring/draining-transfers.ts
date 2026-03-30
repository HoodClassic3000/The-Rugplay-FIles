import type { UserRecord, AltIndicator } from '../types';
import { DRAINING_TRANSFERS, capScore } from '../config';

function isCashTransfer(tx: { coinSymbol: string | null; pricePerCoin: number }): boolean {
    return tx.coinSymbol === 'LKC' || tx.pricePerCoin === 1;
}

interface DrainingEvent {
    recipientUserId: number;
    recipientUsername: string | null;
    amount: number;
    estimatedBalanceBefore: number;
    drainRatio: number;
    timestamp: string;
}

function estimateRunningBalance(user: UserRecord): { timestamp: string; balance: number }[] {
    const sorted = [...user.recentTransactions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const snapshots: { timestamp: string; balance: number }[] = [];
    let balance = user.stats?.baseCurrencyBalance ?? 0;

    const reversed = [...sorted].reverse();
    for (const tx of reversed) {
        if (tx.type === 'BUY') balance += tx.totalBaseCurrencyAmount;
        if (tx.type === 'SELL') balance -= tx.totalBaseCurrencyAmount;
        if (tx.type === 'TRANSFER_OUT' && isCashTransfer(tx)) balance += tx.totalBaseCurrencyAmount;
        if (tx.type === 'TRANSFER_IN' && isCashTransfer(tx)) balance -= tx.totalBaseCurrencyAmount;
    }

    let runningBalance = Math.max(balance, 0);

    for (const tx of sorted) {
        snapshots.push({ timestamp: tx.timestamp, balance: runningBalance });
        if (tx.type === 'BUY') runningBalance -= tx.totalBaseCurrencyAmount;
        if (tx.type === 'SELL') runningBalance += tx.totalBaseCurrencyAmount;
        if (tx.type === 'TRANSFER_OUT' && isCashTransfer(tx)) runningBalance -= tx.totalBaseCurrencyAmount;
        if (tx.type === 'TRANSFER_IN' && isCashTransfer(tx)) runningBalance += tx.totalBaseCurrencyAmount;
        runningBalance = Math.max(runningBalance, 0);
    }

    return snapshots;
}

export function scoreDrainingTransfers(
    user: UserRecord,
    candidateMainUserIds: Set<number>
): AltIndicator[] {
    const indicators: AltIndicator[] = [];
    const balanceSnapshots = estimateRunningBalance(user);

    const sortedTx = [...user.recentTransactions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const drainingEvents: DrainingEvent[] = [];

    sortedTx.forEach((tx, i) => {
        if (tx.type !== 'TRANSFER_OUT' || tx.recipientUserId === null) return;
        if (!isCashTransfer(tx)) return;

        const snapshot = balanceSnapshots[i];
        if (!snapshot || snapshot.balance === 0) return;

        const drainRatio = tx.totalBaseCurrencyAmount / snapshot.balance;
        if (drainRatio < DRAINING_TRANSFERS.minDrainRatio) return;

        drainingEvents.push({
            recipientUserId: tx.recipientUserId,
            recipientUsername: tx.recipientUsername,
            amount: tx.totalBaseCurrencyAmount,
            estimatedBalanceBefore: snapshot.balance,
            drainRatio,
            timestamp: tx.timestamp,
        });
    });

    if (drainingEvents.length === 0) return indicators;

    const latestEventTime = Math.max(...sortedTx.map(tx => new Date(tx.timestamp).getTime()));
    const now = latestEventTime || Date.now();

    const byRecipient = new Map<number, DrainingEvent[]>();
    for (const event of drainingEvents) {
        const existing = byRecipient.get(event.recipientUserId) || [];
        existing.push(event);
        byRecipient.set(event.recipientUserId, existing);
    }

    const windowMs = DRAINING_TRANSFERS.windowDays * 24 * 60 * 60 * 1000;

    for (const [recipientId, events] of byRecipient) {
        const withinWindow = events.filter(e => {
            const age = now - new Date(e.timestamp).getTime();
            return age <= windowMs;
        });

        if (withinWindow.length < DRAINING_TRANSFERS.minDrainingEventsShortWindow) continue;

        let score = 0;

        
        score += DRAINING_TRANSFERS.scores.twoOrMoreDrains; 
        if (withinWindow.length >= DRAINING_TRANSFERS.minDrainingEventsHighWindow) {
            score += (withinWindow.length - 2) * 5; 
        }

        candidateMainUserIds.add(recipientId);

        const recipientUsername = events[0].recipientUsername;

        indicators.push({
            type: 'draining_transfers',
            score: capScore(score),
            candidateMainUserId: recipientId,
            details: {
                recipientUsername,
                drainingEventCount: withinWindow.length,
                totalDrained: withinWindow.reduce((s, e) => s + e.amount, 0),
                averageDrainRatio: Number(
                    (withinWindow.reduce((s, e) => s + e.drainRatio, 0) / withinWindow.length).toFixed(4)
                ),
                windowDays: DRAINING_TRANSFERS.windowDays,
                events: withinWindow.map(e => ({
                    amount: e.amount,
                    estimatedBalanceBefore: e.estimatedBalanceBefore,
                    drainRatio: Number(e.drainRatio.toFixed(4)),
                    timestamp: e.timestamp,
                })),
            },
            evidenceTransactionIds: user.recentTransactions
                .filter(
                    tx =>
                        tx.type === 'TRANSFER_OUT' &&
                        tx.recipientUserId === recipientId
                )
                .map(tx => tx.id),
            detectedAt: new Date().toISOString(),
        });
    }

    return indicators;
}