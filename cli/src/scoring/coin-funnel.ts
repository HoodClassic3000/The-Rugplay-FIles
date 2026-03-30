import type { UserRecord, AltIndicator } from '../types';
import { COIN_FUNNEL, ACCOUNT_AGE, capScore } from '../config';

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

interface CoinTransferGroup {
    recipientUserId: number;
    recipientUsername: string | null;
    totalMarketValue: number;
    eventCount: number;
    eventTimestamps: string[];
    maxDrainShare: number;
}

function isCoinTransfer(tx: { coinSymbol: string | null; pricePerCoin: number }): boolean {
    return tx.coinSymbol !== 'LKC' && tx.pricePerCoin !== 1; // It's a true coin transfer
}

function groupTransfersByRecipient(user: UserRecord): CoinTransferGroup[] {
    const map = new Map<number, CoinTransferGroup>();

    for (const tx of user.recentTransactions) {
        if (tx.type !== 'TRANSFER_OUT') continue;
        if (tx.recipientUserId === null) continue;
        if (!isCoinTransfer(tx)) continue;

        let drainShare = 0;
        if (tx.senderHoldingsBefore && tx.senderHoldingsBefore > 0) {
            // Note: tx.totalBaseCurrencyAmount here represents the fiat market value of the coins.
            drainShare = tx.totalBaseCurrencyAmount / tx.senderHoldingsBefore;
        } else {
            // Fallback: If live script didn't catch the before-balance, we just use 0 drain share.
            drainShare = 0;
        }

        const existing = map.get(tx.recipientUserId);
        if (existing) {
            existing.totalMarketValue += tx.totalBaseCurrencyAmount;
            existing.eventCount += 1;
            existing.eventTimestamps.push(tx.timestamp);
            existing.maxDrainShare = Math.max(existing.maxDrainShare, drainShare);
        } else {
            map.set(tx.recipientUserId, {
                recipientUserId: tx.recipientUserId,
                recipientUsername: tx.recipientUsername,
                totalMarketValue: tx.totalBaseCurrencyAmount,
                eventCount: 1,
                eventTimestamps: [tx.timestamp],
                maxDrainShare: drainShare,
            });
        }
    }

    return Array.from(map.values());
}

export function scoreCoinFunnel(
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

    if (groups.length === 0) return indicators;

    for (const group of groups) {
        const meetsDrainThreshold = group.maxDrainShare >= COIN_FUNNEL.minBalanceDrainShare;
        const meetsValueThreshold = group.totalMarketValue >= COIN_FUNNEL.minTransferValueUSD && group.eventCount >= COIN_FUNNEL.minSeparateTransferEvents;

        if (!meetsDrainThreshold && !meetsValueThreshold) continue;

        let score = 0;

        if (isCreatedThisMonth(user, globalNowMs)) {
            score += COIN_FUNNEL.scores.createdThisMonth;
        } else if (isNewAccount(user, globalNowMs)) {
            score += COIN_FUNNEL.scores.createdWithin30Days;
        }

        if (group.maxDrainShare >= COIN_FUNNEL.highBalanceDrainShare) {
            score += COIN_FUNNEL.scores.drainShareVeryHigh;
            score += COIN_FUNNEL.scores.fullDrainBonus; // Max drain
        } else if (group.maxDrainShare >= COIN_FUNNEL.minBalanceDrainShare) {
            score += COIN_FUNNEL.scores.drainShareHigh;
        }

        if (group.eventCount >= COIN_FUNNEL.minSeparateTransferEvents) {
            score += COIN_FUNNEL.scores.repeatedTransferEvents;
        }

        if (score === 0) continue;

        indicators.push({
            type: 'coin_funnel',
            score: capScore(score),
            candidateMainUserId: group.recipientUserId,
            candidateMainUsername: group.recipientUsername || undefined,
            detectedAt: new Date().toISOString(),
            details: {
                totalMarketValueTransferred: group.totalMarketValue,
                maxDrainShare: group.maxDrainShare,
                eventCount: group.eventCount,
            },
        });
        candidateMainUserIds.add(group.recipientUserId);
    }

    return indicators;
}
