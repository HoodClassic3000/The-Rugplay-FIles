import type { UserRecord, CoinRecord, AltIndicator, RawTradeEvent } from '../types';
import { RUG_LAUNDERING, capScore } from '../config';

interface TradeSequence {
    coinSymbol: string;
    buyAmount: number;
    buyTimestamp: string;
    sellReturn: number;
    sellTimestamp: string;
    dominantHolderUserId: number;
    dominantHolderPercentage: number;
}

function getDominantHolder(coin: CoinRecord): { userId: number; percentage: number } | null {
    if (!coin.holders.length) return null;
    const top = coin.holders[0];
    if (top.percentage / 100 >= RUG_LAUNDERING.dominantHolderThreshold) {
        return { userId: top.userId, percentage: top.percentage / 100 };
    }
    return null;
}

function isCreatorOrDominant(
    coin: CoinRecord,
    candidateUserId: number
): { matched: boolean; percentage: number } {
    if (coin.creatorId === candidateUserId) {
        const holder = coin.holders.find(h => h.userId === candidateUserId);
        return { matched: true, percentage: holder ? holder.percentage / 100 : 1.0 };
    }
    const dominant = getDominantHolder(coin);
    if (dominant && dominant.userId === candidateUserId) {
        return { matched: true, percentage: dominant.percentage };
    }
    return { matched: false, percentage: 0 };
}

function estimateBalanceBeforeTrade(user: UserRecord, beforeTimestamp: string): number {
    const before = new Date(beforeTimestamp).getTime();
    const prior = user.recentTransactions
        .filter(tx => new Date(tx.timestamp).getTime() < before)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (user.stats && prior.length === 0) {
        return user.stats.baseCurrencyBalance;
    }

    if (prior.length > 0) {
        let balance = user.stats?.baseCurrencyBalance ?? 0;
        const allTx = [...user.recentTransactions].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        for (const tx of allTx) {
            if (new Date(tx.timestamp).getTime() <= before) break;
            if (tx.type === 'BUY') balance += tx.totalBaseCurrencyAmount;
            if (tx.type === 'SELL') balance -= tx.totalBaseCurrencyAmount;
            if (tx.type === 'TRANSFER_OUT') balance += tx.totalBaseCurrencyAmount;
            if (tx.type === 'TRANSFER_IN') balance -= tx.totalBaseCurrencyAmount;
        }
        return Math.max(balance, 0);
    }

    return 0;
}

function buildTradeSequences(
    user: UserRecord,
    coins: Map<string, CoinRecord>
): TradeSequence[] {
    const sequences: TradeSequence[] = [];
    const txByCoin = new Map<string, typeof user.recentTransactions>();

    for (const tx of user.recentTransactions) {
        if (!tx.coinSymbol) continue;
        const existing = txByCoin.get(tx.coinSymbol) || [];
        existing.push(tx);
        txByCoin.set(tx.coinSymbol, existing);
    }

    for (const [symbol, txs] of txByCoin) {
        const coin = coins.get(symbol);
        if (!coin) continue;

        const dominant = getDominantHolder(coin);
        if (!dominant) continue;

        const sorted = [...txs].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const buys = sorted.filter(t => t.type === 'BUY');
        const sells = sorted.filter(t => t.type === 'SELL');

        for (const buy of buys) {
            const estimatedBalance = estimateBalanceBeforeTrade(user, buy.timestamp);
            if (estimatedBalance === 0) continue;

            const buyShare = buy.totalBaseCurrencyAmount / estimatedBalance;
            if (buyShare < RUG_LAUNDERING.minBuyShareOfBalance) continue;

            const buyTime = new Date(buy.timestamp).getTime();

            const matchingSell = sells.find(sell => {
                const sellTime = new Date(sell.timestamp).getTime();
                const hoursApart = (sellTime - buyTime) / (1000 * 60 * 60);
                if (hoursApart < 0 || hoursApart > RUG_LAUNDERING.maxHoursBetweenBuyAndRug) return false;
                const returnRatio = sell.totalBaseCurrencyAmount / buy.totalBaseCurrencyAmount;
                return returnRatio <= RUG_LAUNDERING.maxSellReturnRatio;
            });

            if (!matchingSell) continue;

            sequences.push({
                coinSymbol: symbol,
                buyAmount: buy.totalBaseCurrencyAmount,
                buyTimestamp: buy.timestamp,
                sellReturn: matchingSell.totalBaseCurrencyAmount,
                sellTimestamp: matchingSell.timestamp,
                dominantHolderUserId: dominant.userId,
                dominantHolderPercentage: dominant.percentage,
            });
        }
    }

    return sequences;
}

export function scoreRugLaundering(
    user: UserRecord,
    coins: Map<string, CoinRecord>,
    candidateMainUserIds: Set<number>,
    allUsers: UserRecord[]
): AltIndicator[] {
    const indicators: AltIndicator[] = [];
    const sequences = buildTradeSequences(user, coins);

    let latestEventMs = 0;
    for (const u of allUsers) {
        const ts = new Date(u.lastSeen || u.createdAt || 0).getTime();
        if (ts > latestEventMs) latestEventMs = ts;
    }
    const globalNowMs = latestEventMs || Date.now();

    if (sequences.length === 0) return indicators;

    const byBeneficiary = new Map<number, TradeSequence[]>();
    for (const seq of sequences) {
        const existing = byBeneficiary.get(seq.dominantHolderUserId) || [];
        existing.push(seq);
        byBeneficiary.set(seq.dominantHolderUserId, existing);
    }

    for (const [beneficiaryId, seqs] of byBeneficiary) {
        const accountAgeDays =
            (globalNowMs - new Date(user.createdAt || user.firstSeen).getTime()) /
            (1000 * 60 * 60 * 24);

        let score = 0;

        
        score += RUG_LAUNDERING.scores.singleSequence; 
        if (seqs.length >= 2) {
            score += (seqs.length - 1) * 10; 
        }

        const maxPercentage = Math.max(...seqs.map(s => s.dominantHolderPercentage));
        if (maxPercentage >= RUG_LAUNDERING.veryDominantHolderThreshold) {
            score += RUG_LAUNDERING.scores.veryDominantHolderBonus;
        }

        if (accountAgeDays <= 30) {
            score += RUG_LAUNDERING.scores.newAccountBonus;
        }

        candidateMainUserIds.add(beneficiaryId);

        indicators.push({
            type: 'rug_laundering',
            score: capScore(score),
            candidateMainUserId: beneficiaryId,
            details: {
                sequenceCount: seqs.length,
                totalLost: seqs.reduce((s, seq) => s + seq.buyAmount - seq.sellReturn, 0),
                totalBought: seqs.reduce((s, seq) => s + seq.buyAmount, 0),
                totalRecovered: seqs.reduce((s, seq) => s + seq.sellReturn, 0),
                maxDominantHolderPercentage: Number(maxPercentage.toFixed(4)),
                accountAgeDays: Number(accountAgeDays.toFixed(1)),
                sequences: seqs.map(s => ({
                    coinSymbol: s.coinSymbol,
                    buyAmount: s.buyAmount,
                    sellReturn: s.sellReturn,
                    buyTimestamp: s.buyTimestamp,
                    sellTimestamp: s.sellTimestamp,
                })),
            },
            evidenceTransactionIds: user.recentTransactions
                .filter(
                    tx =>
                        (tx.type === 'BUY' || tx.type === 'SELL') &&
                        seqs.some(s => s.coinSymbol === tx.coinSymbol)
                )
                .map(tx => tx.id),
            detectedAt: new Date().toISOString(),
        });
    }

    return indicators;
}