import fs from 'fs';
import path from 'path';
import type {
    RawExportFile,
    RawEvent,
    RawTradeEvent,
    RawArcadeEvent,
    RawEnrichedSnapshotEvent,
    UserRecord,
    CoinRecord,
    TransactionRecord,
    InternalStore,
} from './types';
import { LOGS } from './config';

function loadLogFiles(dir: string): RawExportFile[] {
    const resolved = path.resolve(__dirname, dir);
    if (!fs.existsSync(resolved)) return [];
    return fs
        .readdirSync(resolved)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const raw = fs.readFileSync(path.join(resolved, f), 'utf-8');
            return JSON.parse(raw) as RawExportFile;
        });
}

function eventKey(event: RawEvent): string {
    return `${event.type}:${event.ts}:${JSON.stringify(event.payload).slice(0, 200)}`;
}

function deduplicateEvents(files: RawExportFile[]): RawEvent[] {
    const seen = new Set<string>();
    const result: RawEvent[] = [];
    for (const file of files) {
        for (const event of file.events) {
            const key = eventKey(event);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(event);
            }
        }
    }
    return result.sort((a, b) => a.ts - b.ts);
}

function blankArcadeStats() {
    return {
        arcadeWins: 0,
        arcadeLosses: 0,
        sessionWagered: 0,
        sessionWon: 0,
        sessionGamesPlayed: 0,
        sessionWins: 0,
        sessionLosses: 0,
    };
}

function blankFlags() {
    return {
        isBanned: false,
        isAdmin: false,
        trustScore: null,
    };
}

function blankAlt() {
    return {
        overallScore: 0,
        overallLabel: 'Unlikely' as const,
        clusters: [] as string[],
        indicators: [],
    };
}

function getOrCreateUser(
    store: InternalStore,
    userId: number | string,
    username: string,
    ts: number
): UserRecord {
    const numericId = Number(userId);
    if (!store.users.has(numericId)) {
        store.users.set(numericId, {
            userId: numericId,
            username,
            name: null,
            avatarUrl: null,
            createdAt: null,
            firstSeen: new Date(ts).toISOString(),
            lastSeen: new Date(ts).toISOString(),
            stats: null,
            arcade: blankArcadeStats(),
            recentTransactions: [],
            createdCoins: [],
            flags: blankFlags(),
            alt: blankAlt(),
            enrichedAt: null,
        });
    }
    return store.users.get(numericId)!;
}

function getOrCreateCoin(store: InternalStore, symbol: string): CoinRecord {
    if (!store.coins.has(symbol)) {
        store.coins.set(symbol, {
            symbol,
            coinId: null,
            name: symbol,
            creatorId: null,
            createdAt: null,
            currentPrice: null,
            marketCap: null,
            holders: [],
            rugEvents: [],
            enrichedAt: null,
        });
    }
    return store.coins.get(symbol)!;
}

function touchUser(user: UserRecord, username: string, ts: number) {
    if (username && user.username !== username) user.username = username;
    if (ts < new Date(user.firstSeen).getTime()) {
        user.firstSeen = new Date(ts).toISOString();
    }
    if (ts > new Date(user.lastSeen).getTime()) {
        user.lastSeen = new Date(ts).toISOString();
    }
}

function processTrade(store: InternalStore, event: RawTradeEvent) {
    const { userId, username, coinSymbol, coinName, timestamp } = event.payload;
    const ts = timestamp || event.ts;
    const user = getOrCreateUser(store, userId, username, ts);
    touchUser(user, username, ts);
    const coin = getOrCreateCoin(store, coinSymbol);
    if (coinName && coin.name === coinSymbol) coin.name = coinName;
}

function processArcade(store: InternalStore, event: RawArcadeEvent) {
    const { userId, username, amount, won, timestamp } = event.payload;
    const ts = timestamp || event.ts;
    const user = getOrCreateUser(store, userId, username, ts);
    touchUser(user, username, ts);
    user.arcade.sessionGamesPlayed += 1;
    user.arcade.sessionWagered += amount;
    if (won) {
        user.arcade.sessionWins += 1;
        user.arcade.sessionWon += amount;
        user.arcade.arcadeWins += amount;
    } else {
        user.arcade.sessionLosses += 1;
        user.arcade.arcadeLosses += amount;
    }
}

function processEnrichedSnapshot(store: InternalStore, event: RawEnrichedSnapshotEvent) {
    const { coinSymbol, userId, holdersSnapshot, userSnapshot, capturedAt } = event.payload;

    if (coinSymbol && holdersSnapshot) {
        const coin = getOrCreateCoin(store, coinSymbol);
        const isNewer = !coin.enrichedAt || new Date(capturedAt) > new Date(coin.enrichedAt);
        if (isNewer) {
            coin.holders = holdersSnapshot.map(h => ({
                userId: h.userId,
                username: h.username,
                percentage: h.percentage,
                quantity: h.quantity,
                liquidationValue: h.liquidationValue,
            }));
            coin.enrichedAt = capturedAt;
        }
    }

    if (userId && userSnapshot) {
        const ts = new Date(capturedAt).getTime();
        const user = getOrCreateUser(store, userId, '', ts);

        if (userSnapshot.profile) {
            const p = userSnapshot.profile as unknown as Record<string, unknown>;
            if (!user.name) user.name = p.name as string;
            if (!user.avatarUrl) user.avatarUrl = p.image as string;
            if (!user.createdAt) user.createdAt = p.createdAt as string;
            user.flags.isBanned = Boolean(p.isBanned);
            user.flags.isAdmin = Boolean(p.isAdmin);
            if (p.loginStreak !== undefined) user.flags.loginStreak = Number(p.loginStreak);
            if (p.prestigeLevel !== undefined) user.flags.prestigeLevel = Number(p.prestigeLevel);
            if (p.founderBadge !== undefined) user.flags.founderBadge = Boolean(p.founderBadge);
            if (p.arcadeWins !== undefined) user.arcade.arcadeWins = Math.max(user.arcade.arcadeWins, Number(p.arcadeWins));
            if (p.arcadeLosses !== undefined) user.arcade.arcadeLosses = Math.max(user.arcade.arcadeLosses, Number(p.arcadeLosses));
        }

        if (userSnapshot.stats) {
            user.stats = {
                baseCurrencyBalance: Number(userSnapshot.stats.baseCurrencyBalance || 0),
                totalBuyVolume: Number(userSnapshot.stats.totalBuyVolume || 0),
                totalSellVolume: Number(userSnapshot.stats.totalSellVolume || 0),
                totalPortfolioValue: Number(userSnapshot.stats.totalPortfolioValue || 0),
                holdingsValue: Number(userSnapshot.stats.holdingsValue || 0),
                holdingsCount: Number(userSnapshot.stats.holdingsCount || 0),
                coinsCreated: Number(userSnapshot.stats.coinsCreated || 0),
                totalTransactions: Number(userSnapshot.stats.totalTransactions || 0),
                transactions24h: Number(userSnapshot.stats.transactions24h || 0),
                buyVolume24h: Number(userSnapshot.stats.buyVolume24h || 0),
                sellVolume24h: Number(userSnapshot.stats.sellVolume24h || 0),
            };
        }

        if (userSnapshot.recentTransactions && userSnapshot.recentTransactions.length > 0) {
            const existingKeys = new Set(user.recentTransactions.map(t =>
                t.id !== null ? String(t.id) : `${t.type}:${t.timestamp}:${t.totalBaseCurrencyAmount}`
            ));
            for (const tx of userSnapshot.recentTransactions as Record<string, unknown>[]) {
                const parsed: TransactionRecord = {
                    id: typeof tx.id === 'number' ? tx.id : null,
                    type: tx.type as TransactionRecord['type'],
                    coinSymbol: typeof tx.coinSymbol === 'string' ? tx.coinSymbol : null,
                    quantity: Number(tx.quantity || 0),
                    pricePerCoin: Number(tx.pricePerCoin || 0),
                    totalBaseCurrencyAmount: Number(tx.totalBaseCurrencyAmount || 0),
                    timestamp: typeof tx.timestamp === 'string'
                        ? tx.timestamp
                        : new Date(Number(tx.timestamp)).toISOString(),
                    recipientUserId: typeof tx.recipientUserId === 'number' ? tx.recipientUserId : null,
                    senderUserId: typeof tx.senderUserId === 'number' ? tx.senderUserId : null,
                    recipientUsername: typeof tx.recipientUsername === 'string' ? tx.recipientUsername : null,
                    senderUsername: typeof tx.senderUsername === 'string' ? tx.senderUsername : null,
                    senderHoldingsBefore: typeof tx.senderHoldingsBefore === 'number' ? tx.senderHoldingsBefore : null,
                };
                const dedupKey = parsed.id !== null ? String(parsed.id) : `${parsed.type}:${parsed.timestamp}:${parsed.totalBaseCurrencyAmount}`;
                if (!existingKeys.has(dedupKey)) {
                    user.recentTransactions.push(parsed);
                    existingKeys.add(dedupKey);
                }
            }
        }

        if (userSnapshot.createdCoins && userSnapshot.createdCoins.length > 0) {
            const existingSymbols = new Set(user.createdCoins);
            for (const c of userSnapshot.createdCoins as Record<string, unknown>[]) {
                const symbol = typeof c.symbol === 'string' ? c.symbol : '';
                if (!symbol || existingSymbols.has(symbol)) continue;
                user.createdCoins.push(symbol);
                existingSymbols.add(symbol);
                const coin = getOrCreateCoin(store, symbol);
                if (coin.creatorId === null) coin.creatorId = userId;
            }
        }

        const isNewer = !user.enrichedAt || new Date(capturedAt) > new Date(user.enrichedAt);
        if (isNewer) user.enrichedAt = capturedAt;
    }
}

function processCoinInfo(store: InternalStore, event: RawEvent) {
    const { coinSymbol, creatorId, name } = event.payload as any;
    if (!coinSymbol) return;
    const coin = getOrCreateCoin(store, coinSymbol);
    if (creatorId) coin.creatorId = Number(creatorId);
    if (name) coin.name = name;
}

function processRugVictim(store: InternalStore, event: RawEvent) {
    const { userId, coinSymbol, lossRatio, lossAmount } = event.payload as any;
    if (!coinSymbol) return;
    const coin = getOrCreateCoin(store, coinSymbol);
    coin.rugEvents.push({
        userId: Number(userId),
        coinSymbol,
        lossRatio: Number(lossRatio),
        lossAmount: Number(lossAmount),
        timestamp: new Date(event.ts).getTime()
    });
}

function processTransferPair(store: InternalStore, event: RawEvent) {
    const e = event.payload as any;
    const fromId = Number(e.senderId);
    const toId = Number(e.recipientId);
    if (!fromId || !toId || fromId === toId) return;

    const relKey = `${fromId}:${toId}:transfer_funnel`;
    
    if (!store.relationships.has(relKey)) {
        store.relationships.set(relKey, {
            fromUserId: fromId,
            toUserId: toId,
            type: 'transfer_funnel',
            weight: 0,
            totalValueMoved: 0,
            eventCount: 0,
            firstSeen: new Date(event.ts).toISOString(),
            lastSeen: new Date(event.ts).toISOString(),
            evidence: [],
        });
    }

    const rel = store.relationships.get(relKey)!;
    rel.totalValueMoved += Number(e.amount || 0);
    rel.eventCount += 1;
    rel.lastSeen = new Date(event.ts).toISOString();
    
    rel.evidence.push({
        timestamp: new Date(event.ts).toISOString(),
        kind: 'TRANSFER',
        amount: Number(e.amount || 0),
        coinSymbol: null,
        senderHoldingsBefore: e.senderHoldingsBefore !== undefined ? Number(e.senderHoldingsBefore) : null,
    });
}

function detectTradePairRelationships(store: InternalStore, events: RawEvent[]) {
    const tradesByCoin = new Map<string, RawTradeEvent[]>();

    for (const event of events) {
        if (event.type !== 'trade') continue;
        const e = event as RawTradeEvent;
        const existing = tradesByCoin.get(e.payload.coinSymbol) || [];
        existing.push(e);
        tradesByCoin.set(e.payload.coinSymbol, existing);
    }

    for (const [symbol, trades] of tradesByCoin) {
        const coin = store.coins.get(symbol);
        if (!coin || coin.creatorId === null) continue;

        const creatorId = coin.creatorId;
        const buysByUser = new Map<number, RawTradeEvent[]>();

        for (const trade of trades) {
            if (trade.payload.tradeType !== 'BUY') continue;
            const uid = Number(trade.payload.userId);
            if (uid === creatorId) continue;
            const existing = buysByUser.get(uid) || [];
            existing.push(trade);
            buysByUser.set(uid, existing);
        }

        for (const [buyerId, buys] of buysByUser) {
            const totalSpent = buys.reduce((sum, t) => sum + t.payload.totalValue, 0);
            const relKey = `${buyerId}:${creatorId}:single_holder_buyer`;

            if (!store.relationships.has(relKey)) {
                store.relationships.set(relKey, {
                    fromUserId: buyerId,
                    toUserId: creatorId,
                    type: 'single_holder_buyer',
                    weight: 0,
                    totalValueMoved: 0,
                    eventCount: 0,
                    firstSeen: new Date(buys[0].ts).toISOString(),
                    lastSeen: new Date(buys[buys.length - 1].ts).toISOString(),
                    evidence: [],
                });
            }

            const rel = store.relationships.get(relKey)!;
            rel.totalValueMoved += totalSpent;
            rel.eventCount += buys.length;
            rel.lastSeen = new Date(buys[buys.length - 1].ts).toISOString();

            for (const buy of buys) {
                rel.evidence.push({
                    timestamp: new Date(buy.ts).toISOString(),
                    kind: 'BUY',
                    amount: buy.payload.totalValue,
                    coinSymbol: symbol,
                });
            }
        }
    }
}

function archiveProcessedLogs(dir: string, fileNames: string[]) {
    if (fileNames.length === 0) return;
    const processedDir = path.join(dir, 'processed');
    if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
    }
    for (const name of fileNames) {
        const src = path.join(dir, name);
        const dest = path.join(processedDir, name);
        if (fs.existsSync(src)) {
            fs.renameSync(src, dest);
        }
    }
    console.log(`Archived ${fileNames.length} processed log file(s) to logs/processed/`);
}

export function mergeLogs(useMock = false, existingStore?: InternalStore): InternalStore {
    const dir = useMock ? LOGS.mockDir : LOGS.inputDir;
    const resolvedDir = path.resolve(__dirname, dir);
    const fileNames = fs.existsSync(resolvedDir)
        ? fs.readdirSync(resolvedDir).filter(f => f.endsWith('.json'))
        : [];
    const files = loadLogFiles(dir);

    const store: InternalStore = existingStore ?? {
        users: new Map(),
        coins: new Map(),
        relationships: new Map(),
        clusters: new Map(),
    };

    const prevUserCount = store.users.size;
    const prevCoinCount = store.coins.size;

    if (files.length === 0) {
        console.log(`No new log files found in ${dir}`);
        return store;
    }

    console.log(`Loaded ${files.length} new log file(s)`);

    const events = deduplicateEvents(files);

    console.log(`Processing ${events.length} deduplicated events`);

    for (const event of events) {
        if (event.type === 'trade') processTrade(store, event as RawTradeEvent);
        if (event.type === 'arcade') processArcade(store, event as RawArcadeEvent);
        if (event.type === 'enriched_snapshot') processEnrichedSnapshot(store, event as RawEnrichedSnapshotEvent);
        if (event.type === 'coin_info') processCoinInfo(store, event);
        if (event.type === 'flag_rug_victim') processRugVictim(store, event);
        if (event.type === 'transfer_pair') processTransferPair(store, event);
    }

    detectTradePairRelationships(store, events);

    const newUsers = store.users.size - prevUserCount;
    const newCoins = store.coins.size - prevCoinCount;
    console.log(`Store now has ${store.users.size} users (+${newUsers}), ${store.coins.size} coins (+${newCoins}), ${store.relationships.size} relationships`);

    if (!useMock) {
        archiveProcessedLogs(resolvedDir, fileNames);
    }

    return store;
}