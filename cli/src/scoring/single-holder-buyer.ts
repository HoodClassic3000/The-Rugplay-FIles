import type { UserRecord, CoinRecord, AltIndicator } from '../types';
import { SINGLE_CREATOR_BUYER, capScore } from '../config';

interface RugSequence {
    holderUserId: number;
    coinSymbol: string;
    buyAmount: number;
    sellReturn: number;
    buyTimestamp: string;
    sellTimestamp: string;
}

const MAX_SELL_RETURN_RATIO = 0.10;
const MAX_HOURS_BETWEEN_BUY_AND_SELL = 72;

function findRugSequencesByTopHolder(
    user: UserRecord,
    coins: Map<string, CoinRecord>
): Map<number, RugSequence[]> {
    const holderSequences = new Map<number, RugSequence[]>();

    const txByCoin = new Map<string, typeof user.recentTransactions>();
    for (const tx of user.recentTransactions) {
        if (!tx.coinSymbol) continue;
        const existing = txByCoin.get(tx.coinSymbol) || [];
        existing.push(tx);
        txByCoin.set(tx.coinSymbol, existing);
    }

    for (const [symbol, txs] of txByCoin) {
        const coin = coins.get(symbol);
        if (!coin || !coin.holders || coin.holders.length === 0) continue;

        // Find the absolute top holder (excluding the buyer themselves)
        const dominantHolder = coin.holders
            .filter(h => h.userId !== user.userId)
            .sort((a, b) => b.percentage - a.percentage)[0];

        if (!dominantHolder) continue;

        const sorted = [...txs].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const buys = sorted.filter(t => t.type === 'BUY');
        const sells = sorted.filter(t => t.type === 'SELL');

        for (const buy of buys) {
            const buyTime = new Date(buy.timestamp).getTime();

            const matchingSell = sells.find(sell => {
                const sellTime = new Date(sell.timestamp).getTime();
                const hoursApart = (sellTime - buyTime) / (1000 * 60 * 60);
                if (hoursApart < 0 || hoursApart > MAX_HOURS_BETWEEN_BUY_AND_SELL) return false;
                const returnRatio = sell.totalBaseCurrencyAmount / buy.totalBaseCurrencyAmount;
                return returnRatio <= MAX_SELL_RETURN_RATIO;
            });

            if (!matchingSell) continue;


            const existing = holderSequences.get(dominantHolder.userId) || [];
            existing.push({
                holderUserId: dominantHolder.userId,
                coinSymbol: symbol,
                buyAmount: buy.totalBaseCurrencyAmount,
                sellReturn: matchingSell.totalBaseCurrencyAmount,
                buyTimestamp: buy.timestamp,
                sellTimestamp: matchingSell.timestamp,
            });
            holderSequences.set(dominantHolder.userId, existing);
        }
    }

    return holderSequences;
}

export function scoreSingleHolderBuyer(
    user: UserRecord,
    coins: Map<string, CoinRecord>,
    candidateMainUserIds: Set<number>
): AltIndicator[] {
    const indicators: AltIndicator[] = [];
    const holderSequences = findRugSequencesByTopHolder(user, coins);

    for (const [holderId, sequences] of holderSequences) {
        if (sequences.length < 2) continue; // Must feed the same mastermind multiple times

        const totalLost = sequences.reduce((s, seq) => s + seq.buyAmount - seq.sellReturn, 0);
        const totalBought = sequences.reduce((s, seq) => s + seq.buyAmount, 0);
        const uniqueCoins = new Set(sequences.map(s => s.coinSymbol));

        let score = SINGLE_CREATOR_BUYER.scores.buyShareVeryHigh;
        score += Math.min((sequences.length - 2) * 5, 20);

        if (score === 0) continue;

        candidateMainUserIds.add(holderId);

        indicators.push({
            type: 'single_holder_buyer',
            score: Math.min(score, 55),
            candidateMainUserId: holderId,
            details: {
                rugSequenceCount: sequences.length,
                totalLost,
                totalBought,
                uniqueCoinsInvolved: Array.from(uniqueCoins),
                sequences: sequences.map(s => ({
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
                        tx.coinSymbol !== null &&
                        sequences.some(s => s.coinSymbol === tx.coinSymbol)
                )
                .map(tx => tx.id),
            detectedAt: new Date().toISOString(),
        });
    }

    return indicators;
}