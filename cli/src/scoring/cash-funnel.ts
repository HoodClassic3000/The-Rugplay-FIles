import type { UserRecord, AltIndicator } from '../types';
import { CASH_FUNNEL, ACCOUNT_AGE, capScore } from '../config';

function getAccountAgeDays(user: UserRecord, globalNowMs: number): number {
    const ref = user.createdAt || user.firstSeen;
    const ms = globalNowMs - new Date(ref).getTime();
    return ms / (1000 * 60 * 60 * 24);
}

function isNewAccount(user: UserRecord, globalNowMs: number): boolean {
    return getAccountAgeDays(user, globalNowMs) <= ACCOUNT_AGE.newAccountDays;
}

function isCreatedThisMonth(user: UserRecord, globalNowMs: number): boolean {
    const ref = user.createdAt || user.firstSeen;
    const d = new Date(ref);
    const now = new Date(globalNowMs);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

interface TransferGroup {
    recipientUserId: number;
    recipientUsername: string | null;
    totalTransferred: number;
    eventCount: number;
    eventTimestamps: string[];
}

function isCashTransfer(tx: { coinSymbol: string | null; pricePerCoin: number }): boolean {
    return tx.coinSymbol === 'LKC' || tx.pricePerCoin === 1;
}

function groupTransfersByRecipient(user: UserRecord): TransferGroup[] {
    const map = new Map<number, TransferGroup>();

    for (const tx of user.recentTransactions) {
        if (tx.type !== 'TRANSFER_OUT') continue;
        if (tx.recipientUserId === null) continue;
        if (!isCashTransfer(tx)) continue;

        const existing = map.get(tx.recipientUserId);
        if (existing) {
            existing.totalTransferred += tx.totalBaseCurrencyAmount;
            existing.eventCount += 1;
            existing.eventTimestamps.push(tx.timestamp);
        } else {
            map.set(tx.recipientUserId, {
                recipientUserId: tx.recipientUserId,
                recipientUsername: tx.recipientUsername,
                totalTransferred: tx.totalBaseCurrencyAmount,
                eventCount: 1,
                eventTimestamps: [tx.timestamp],
            });
        }
    }

    return Array.from(map.values());
}

function totalOutflows(user: UserRecord): number {
    return user.recentTransactions
        .filter(tx => tx.type === 'TRANSFER_OUT' && isCashTransfer(tx))
        .reduce((sum, tx) => sum + tx.totalBaseCurrencyAmount, 0);
}

function estimatePreTransferBalance(user: UserRecord): number {
    const currentBalance = user.stats?.baseCurrencyBalance ?? 0;
    const outflows = totalOutflows(user);
    
    return currentBalance + outflows;
}

export function scoreCashFunnel(
    user: UserRecord,
    candidateMainUserIds: Set<number>,
    allUsers: UserRecord[]
): AltIndicator[] {
    const indicators: AltIndicator[] = [];
    
    let latestEventMs = 0;
    for (const u of allUsers) {
        const ts = new Date(u.lastSeen || u.createdAt || 0).getTime();
        if (ts > latestEventMs) latestEventMs = ts;
    }
    const globalNowMs = latestEventMs || Date.now();
    const groups = groupTransfersByRecipient(user);
    const outflows = totalOutflows(user);
    const preTransferBalance = estimatePreTransferBalance(user);

    if (outflows === 0 || groups.length === 0) return indicators;

    for (const group of groups) {
        if (group.totalTransferred < CASH_FUNNEL.minTotalTransferred) continue;

        const transferShare = group.totalTransferred / outflows;
        if (transferShare < CASH_FUNNEL.minTransferShareToFlag) continue;

        
        const balanceShare = preTransferBalance > 0
            ? group.totalTransferred / preTransferBalance
            : 1;

        let score = 0;

        
        if (isCreatedThisMonth(user, globalNowMs)) {
            score += CASH_FUNNEL.scores.createdThisMonth;
        } else if (isNewAccount(user, globalNowMs)) {
            score += CASH_FUNNEL.scores.createdWithin30Days;
        }

        
        if (transferShare >= CASH_FUNNEL.highTransferShare) {
            score += CASH_FUNNEL.scores.transferShareVeryHigh;
        } else {
            score += CASH_FUNNEL.scores.transferShareHigh;
        }

        
        if (group.eventCount >= CASH_FUNNEL.minSeparateTransferEvents) {
            score += CASH_FUNNEL.scores.repeatedTransferEvents;
        }

        if (balanceShare >= 0.95) {
            score += CASH_FUNNEL.scores.fullDrainBonus;
        }

        if (balanceShare < 0.90) continue;

        if (score === 0) continue;

        candidateMainUserIds.add(group.recipientUserId);

        indicators.push({
            type: 'cash_funnel',
            score: capScore(score),
            candidateMainUserId: group.recipientUserId,
            details: {
                recipientUsername: group.recipientUsername,
                totalTransferred: group.totalTransferred,
                transferShare: Number(transferShare.toFixed(4)),
                balanceShare: Number(balanceShare.toFixed(4)),
                estimatedPreTransferBalance: Math.round(preTransferBalance),
                eventCount: group.eventCount,
                accountAgeDays: Number(getAccountAgeDays(user, globalNowMs).toFixed(1)),
                isNewAccount: isNewAccount(user, globalNowMs),
                isCreatedThisMonth: isCreatedThisMonth(user, globalNowMs),
            },
            evidenceTransactionIds: user.recentTransactions
                .filter(
                    tx =>
                        tx.type === 'TRANSFER_OUT' &&
                        tx.recipientUserId === group.recipientUserId
                )
                .map(tx => tx.id),
            detectedAt: new Date().toISOString(),
        });
    }

    return indicators;
}