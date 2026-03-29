import type { UserRecord, CoinRecord, AltIndicator } from '../types';
import { ARCADE_LAUNDERING, capScore } from '../config';

function isArcadeDominant(user: UserRecord): boolean {
    const arcadeTotal = user.arcade.arcadeWins + user.arcade.arcadeLosses;
    const tradeTotal = (user.stats?.totalBuyVolume ?? 0) + (user.stats?.totalSellVolume ?? 0);
    const total = arcadeTotal + tradeTotal;
    if (total === 0) return false;
    return arcadeTotal / total >= ARCADE_LAUNDERING.minArcadeActivityRatio;
}

function hasMinimumHoldings(user: UserRecord): boolean {
    const holdingsCount = user.stats?.holdingsCount ?? 0;
    const coinsCreated = user.stats?.coinsCreated ?? 0;
    return holdingsCount <= ARCADE_LAUNDERING.maxHoldingsCount && coinsCreated === 0;
}

function findTransferLaunderingLinks(
    user: UserRecord,
    winTimestamp: number
): { recipientUserId: number; recipientUsername: string | null; amount: number }[] {
    const windowMs = ARCADE_LAUNDERING.launderingLinkWindowDays * 24 * 60 * 60 * 1000;
    const links: { recipientUserId: number; recipientUsername: string | null; amount: number }[] = [];

    for (const tx of user.recentTransactions) {
        if (tx.type !== 'TRANSFER_OUT' || tx.recipientUserId === null) continue;
        const txTime = new Date(tx.timestamp).getTime();
        if (txTime < winTimestamp || txTime > winTimestamp + windowMs) continue;
        if (tx.totalBaseCurrencyAmount < ARCADE_LAUNDERING.largeWinSessionThreshold * ARCADE_LAUNDERING.minLaunderTransferShare) continue;
        links.push({
            recipientUserId: tx.recipientUserId,
            recipientUsername: tx.recipientUsername,
            amount: tx.totalBaseCurrencyAmount,
        });
    }

    return links;
}

function findRugLaunderingLinks(
    user: UserRecord,
    coins: Map<string, CoinRecord>,
    winTimestamp: number
): { beneficiaryUserId: number; coinSymbol: string; amount: number }[] {
    const windowMs = ARCADE_LAUNDERING.launderingLinkWindowDays * 24 * 60 * 60 * 1000;
    const links: { beneficiaryUserId: number; coinSymbol: string; amount: number }[] = [];

    for (const tx of user.recentTransactions) {
        if (tx.type !== 'BUY' || !tx.coinSymbol) continue;
        const txTime = new Date(tx.timestamp).getTime();
        if (txTime < winTimestamp || txTime > winTimestamp + windowMs) continue;

        const coin = coins.get(tx.coinSymbol);
        if (!coin || !coin.holders.length) continue;

        const topHolder = coin.holders[0];
        if (topHolder.percentage / 100 < 0.80) continue;
        if (topHolder.userId === user.userId) continue;

        links.push({
            beneficiaryUserId: topHolder.userId,
            coinSymbol: tx.coinSymbol,
            amount: tx.totalBaseCurrencyAmount,
        });
    }

    return links;
}

export function scoreArcadeLaundering(
    user: UserRecord,
    coins: Map<string, CoinRecord>,
    candidateMainUserIds: Set<number>,
    allUsers: UserRecord[]
): AltIndicator[] {
    const indicators: AltIndicator[] = [];

    let latestEventMs = 0;
    for (const u of allUsers) {
        const ts = new Date(u.lastSeen || u.createdAt || 0).getTime();
        if (ts > latestEventMs) latestEventMs = ts;
    }
    const now = latestEventMs || Date.now();

    const arcadeDominant = isArcadeDominant(user);
    const lowHoldings = hasMinimumHoldings(user);
    const lifetimeWinsHigh = user.arcade.arcadeWins >= ARCADE_LAUNDERING.minLifetimeWinsToFlag;

    if (!arcadeDominant && !lifetimeWinsHigh) return indicators;

    const accountAgeDays =
        (now - new Date(user.createdAt || user.firstSeen || 0).getTime()) /
        (1000 * 60 * 60 * 24);

    const largeSessions = user.arcade.sessionWon >= ARCADE_LAUNDERING.largeWinSessionThreshold
        ? [{ timestamp: now - (1000 * 60 * 60 * 24), wonAmount: user.arcade.sessionWon }]
        : [];

    for (const session of largeSessions) {
        const transferLinks = findTransferLaunderingLinks(user, session.timestamp);
        const rugLinks = findRugLaunderingLinks(user, coins, session.timestamp);

        const allLinks = [
            ...transferLinks.map(l => ({ beneficiaryId: l.recipientUserId, username: l.recipientUsername, amount: l.amount, method: 'transfer' as const })),
            ...rugLinks.map(l => ({ beneficiaryId: l.beneficiaryUserId, username: null, amount: l.amount, method: 'rug_sequence' as const })),
        ];

        if (allLinks.length === 0) continue;

        const byBeneficiary = new Map<number, typeof allLinks>();
        for (const link of allLinks) {
            const existing = byBeneficiary.get(link.beneficiaryId) || [];
            existing.push(link);
            byBeneficiary.set(link.beneficiaryId, existing);
        }

        for (const [beneficiaryId, links] of byBeneficiary) {
            let score = 0;

            if (arcadeDominant && lowHoldings) score += ARCADE_LAUNDERING.scores.arcadeDominantProfile;
            if (lifetimeWinsHigh) score += ARCADE_LAUNDERING.scores.lifetimeWinsAboveThreshold;
            score += ARCADE_LAUNDERING.scores.confirmedLaunderingLink;
            if (accountAgeDays <= 30) score += ARCADE_LAUNDERING.scores.newAccountBonus;

            candidateMainUserIds.add(beneficiaryId);

            indicators.push({
                type: 'arcade_laundering',
                score: capScore(score),
                candidateMainUserId: beneficiaryId,
                details: {
                    arcadeDominant,
                    lifetimeWins: user.arcade.arcadeWins,
                    sessionWon: session.wonAmount,
                    accountAgeDays: Number(accountAgeDays.toFixed(1)),
                    lowHoldings,
                    launderingLinks: links.map(l => ({
                        method: l.method,
                        amount: l.amount,
                        coinSymbol: 'coinSymbol' in l ? l.coinSymbol : undefined,
                    })),
                    totalLaundered: links.reduce((s, l) => s + l.amount, 0),
                },
                evidenceTransactionIds: user.recentTransactions
                    .filter(tx => tx.type === 'TRANSFER_OUT' && tx.recipientUserId === beneficiaryId)
                    .map(tx => tx.id),
                detectedAt: new Date().toISOString(),
            });
        }
    }

    return indicators;
}