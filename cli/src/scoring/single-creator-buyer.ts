import type { UserRecord, CoinRecord, AltIndicator } from '../types';
import { SINGLE_CREATOR_BUYER, capScore } from '../config';


interface RugSequence {
    creatorUserId: number;
    coinSymbol: string;
    buyAmount: number;
    sellReturn: number;
    buyTimestamp: string;
    sellTimestamp: string;
}

const MAX_SELL_RETURN_RATIO = 0.10; 
const MAX_HOURS_BETWEEN_BUY_AND_SELL = 72; 

function findRugSequencesByCreator(
    user: UserRecord,
    coins: Map<string, CoinRecord>
): Map<number, RugSequence[]> {
    const creatorSequences = new Map<number, RugSequence[]>();

    
    const txByCoin = new Map<string, typeof user.recentTransactions>();
    for (const tx of user.recentTransactions) {
        if (!tx.coinSymbol) continue;
        const existing = txByCoin.get(tx.coinSymbol) || [];
        existing.push(tx);
        txByCoin.set(tx.coinSymbol, existing);
    }

    for (const [symbol, txs] of txByCoin) {
        const coin = coins.get(symbol);
        if (!coin || coin.creatorId === null) continue;
        if (coin.creatorId === user.userId) continue; 

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

            const creatorId = coin.creatorId;
            const existing = creatorSequences.get(creatorId) || [];
            existing.push({
                creatorUserId: creatorId,
                coinSymbol: symbol,
                buyAmount: buy.totalBaseCurrencyAmount,
                sellReturn: matchingSell.totalBaseCurrencyAmount,
                buyTimestamp: buy.timestamp,
                sellTimestamp: matchingSell.timestamp,
            });
            creatorSequences.set(creatorId, existing);
        }
    }

    return creatorSequences;
}

export function scoreSingleCreatorBuyer(
    user: UserRecord,
    coins: Map<string, CoinRecord>,
    candidateMainUserIds: Set<number>
): AltIndicator[] {
    const indicators: AltIndicator[] = [];
    const creatorSequences = findRugSequencesByCreator(user, coins);

    for (const [creatorId, sequences] of creatorSequences) {
        if (sequences.length < 1) continue;

        const totalLost = sequences.reduce((s, seq) => s + seq.buyAmount - seq.sellReturn, 0);
        const totalBought = sequences.reduce((s, seq) => s + seq.buyAmount, 0);
        const uniqueCoins = new Set(sequences.map(s => s.coinSymbol));

        let score = 0;

        if (sequences.length === 1) {
            
            score += SINGLE_CREATOR_BUYER.scores.buyShareHigh; 
        } else if (sequences.length >= 2) {
            
            score += SINGLE_CREATOR_BUYER.scores.buyShareVeryHigh; 
            
            score += Math.min((sequences.length - 2) * 5, 20); 
        }

        if (score === 0) continue;

        candidateMainUserIds.add(creatorId);

        indicators.push({
            type: 'single_creator_buyer',
            score: capScore(score),
            candidateMainUserId: creatorId,
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