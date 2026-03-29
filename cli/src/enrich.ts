import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type {
    InternalStore,
    UserRecord,
    CoinRecord,
    CoinHolder,
    TransactionRecord,
    UserStats,
} from './types';
import { ENRICHMENT } from './config';

const CACHE_FILE = path.resolve(__dirname, '../../.enrichment-cache.json');

interface CacheEntry {
    data: unknown;
    fetchedAt: string;
}

interface EnrichmentCache {
    users: Record<string, CacheEntry>;
    coins: Record<string, CacheEntry>;
}

function loadCache(): EnrichmentCache {
    if (fs.existsSync(CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
    return { users: {}, coins: {} };
}

function saveCache(cache: EnrichmentCache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, cookie: string): Promise<unknown> {
    let attempts = 0;
    while (attempts < ENRICHMENT.maxRetriesPerRequest) {
        try {
            const res = await fetch(url, {
                headers: {
                    Cookie: cookie,
                    'User-Agent': 'Mozilla/5.0',
                },
            });
            if (res.status === 429) {
                console.log(`Rate limited on ${url}, waiting ${ENRICHMENT.retryBackoffMs}ms`);
                await sleep(ENRICHMENT.retryBackoffMs);
                attempts++;
                continue;
            }
            if (!res.ok) {
                console.log(`Failed ${url} — HTTP ${res.status}`);
                return null;
            }
            return await res.json();
        } catch (err) {
            console.log(`Error fetching ${url}: ${err}`);
            attempts++;
            await sleep(ENRICHMENT.retryBackoffMs);
        }
    }
    return null;
}

function isCacheStale(entry: CacheEntry | undefined): boolean {
    if (!entry) return true;
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    return age >= 1000 * 60 * 60 * 6;
}

function parseUserApiResponse(data: unknown, user: UserRecord) {
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;

    if (d.profile && typeof d.profile === 'object') {
        const p = d.profile as Record<string, unknown>;
        user.name = typeof p.name === 'string' ? p.name : user.name;
        user.avatarUrl = typeof p.image === 'string' ? p.image : user.avatarUrl;
        user.createdAt = typeof p.createdAt === 'string' ? p.createdAt : user.createdAt;
        user.flags.isBanned = typeof p.isBanned === 'boolean' ? p.isBanned : user.flags.isBanned;
        user.flags.isAdmin = typeof p.isAdmin === 'boolean' ? p.isAdmin : user.flags.isAdmin;
        if (typeof p.loginStreak === 'number') user.flags.loginStreak = p.loginStreak;
        if (typeof p.prestigeLevel === 'number') user.flags.prestigeLevel = p.prestigeLevel;
        if (typeof p.founderBadge === 'boolean') user.flags.founderBadge = p.founderBadge;
        if (typeof p.arcadeWins === 'number') user.arcade.arcadeWins = Math.max(user.arcade.arcadeWins, p.arcadeWins);
        if (typeof p.arcadeLosses === 'number') user.arcade.arcadeLosses = Math.max(user.arcade.arcadeLosses, p.arcadeLosses);
    }

    if (d.stats && typeof d.stats === 'object') {
        const s = d.stats as Record<string, unknown>;
        user.stats = {
            baseCurrencyBalance: Number(s.baseCurrencyBalance || 0),
            totalBuyVolume: Number(s.totalBuyVolume || 0),
            totalSellVolume: Number(s.totalSellVolume || 0),
            totalPortfolioValue: Number(s.totalPortfolioValue || 0),
            holdingsValue: Number(s.holdingsValue || 0),
            holdingsCount: Number(s.holdingsCount || 0),
            coinsCreated: Number(s.coinsCreated || 0),
            totalTransactions: Number(s.totalTransactions || 0),
            transactions24h: Number(s.transactions24h || 0),
            buyVolume24h: Number(s.buyVolume24h || 0),
            sellVolume24h: Number(s.sellVolume24h || 0),
        } as UserStats;
    }

    if (Array.isArray(d.recentTransactions)) {
        const existingKeys = new Set(user.recentTransactions.map(t =>
            t.id !== null ? String(t.id) : `${t.type}:${t.timestamp}:${t.totalBaseCurrencyAmount}`
        ));
        for (const t of d.recentTransactions as Record<string, unknown>[]) {
            const parsed: TransactionRecord = {
                id: typeof t.id === 'number' ? t.id : null,
                type: t.type as TransactionRecord['type'],
                coinSymbol: typeof t.coinSymbol === 'string' ? t.coinSymbol : null,
                quantity: Number(t.quantity || 0),
                pricePerCoin: Number(t.pricePerCoin || 0),
                totalBaseCurrencyAmount: Number(t.totalBaseCurrencyAmount || 0),
                timestamp: typeof t.timestamp === 'string'
                    ? t.timestamp
                    : new Date(Number(t.timestamp)).toISOString(),
                recipientUserId: typeof t.recipientUserId === 'number' ? t.recipientUserId : null,
                senderUserId: typeof t.senderUserId === 'number' ? t.senderUserId : null,
                recipientUsername: typeof t.recipientUsername === 'string' ? t.recipientUsername : null,
                senderUsername: typeof t.senderUsername === 'string' ? t.senderUsername : null,
            };
            const dedupKey = parsed.id !== null ? String(parsed.id) : `${parsed.type}:${parsed.timestamp}:${parsed.totalBaseCurrencyAmount}`;
            if (!existingKeys.has(dedupKey)) {
                user.recentTransactions.push(parsed);
                existingKeys.add(dedupKey);
            }
        }
    }

    if (Array.isArray(d.createdCoins)) {
        const existingSymbols = new Set(user.createdCoins);
        for (const c of d.createdCoins as Record<string, unknown>[]) {
            const symbol = typeof c.symbol === 'string' ? c.symbol : '';
            if (symbol && !existingSymbols.has(symbol)) {
                user.createdCoins.push(symbol);
                existingSymbols.add(symbol);
            }
        }
    }
}

function parseCoinApiResponse(data: unknown, coin: CoinRecord) {
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;

    const coinData = (d.coin && typeof d.coin === 'object')
        ? d.coin as Record<string, unknown>
        : d;

    coin.coinId = typeof coinData.id === 'number' ? coinData.id : coin.coinId;
    coin.name = typeof coinData.name === 'string' ? coinData.name : coin.name;
    coin.creatorId = typeof coinData.creatorId === 'number' ? coinData.creatorId : coin.creatorId;
    coin.createdAt = typeof coinData.createdAt === 'string' ? coinData.createdAt : coin.createdAt;
    coin.currentPrice = typeof coinData.currentPrice === 'number' ? coinData.currentPrice : coin.currentPrice;
    coin.marketCap = typeof coinData.marketCap === 'number' ? coinData.marketCap : coin.marketCap;
}

function parseCoinHoldersResponse(data: unknown, coin: CoinRecord) {
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;
    if (!Array.isArray(d.holders)) return;
    coin.holders = (d.holders as Record<string, unknown>[]).map(h => ({
        userId: Number(h.userId),
        username: typeof h.username === 'string' ? h.username : '',
        percentage: Number(h.percentage || 0),
        quantity: Number(h.quantity || 0),
        liquidationValue: Number(h.liquidationValue || 0),
    })) as CoinHolder[];
}

function needsUserEnrichment(user: UserRecord, cache: EnrichmentCache): boolean {
    if (!user.enrichedAt) return true;
    return isCacheStale(cache.users[String(user.userId)]);
}

function needsCoinEnrichment(coin: CoinRecord, cache: EnrichmentCache): boolean {
    if (!coin.enrichedAt) return true;
    return isCacheStale(cache.coins[coin.symbol]);
}

export async function enrichStore(store: InternalStore, cookie: string) {
    const cache = loadCache();
    let requestCount = 0;

    async function throttledFetch(url: string): Promise<unknown> {
        if (requestCount > 0) {
            await sleep(ENRICHMENT.requestCooldownMs);
        }
        requestCount++;
        console.log(`[${requestCount}] Fetching ${url}`);
        return fetchWithRetry(url, cookie);
    }

    let usersToEnrich = Array.from(store.users.values()).filter(u =>
        needsUserEnrichment(u, cache)
    );

    const hasSeededBefore = cache.users['__leaderboard_seeded'] !== undefined;
    if (!hasSeededBefore) {
        cache.users['__leaderboard_seeded'] = { data: true, fetchedAt: new Date().toISOString() };
        saveCache(cache);

        const topPullers = await throttledFetch(`https://rugplay.com/api/leaderboard?type=topRugpullers`) as any;
        const cashKings = await throttledFetch(`https://rugplay.com/api/leaderboard?type=cashKings`) as any;
        
        const seedUsers = [...(topPullers?.users || []), ...(cashKings?.users || [])];
        for (const su of seedUsers) {
            if (su && su.userId && !store.users.has(su.userId)) {
                 store.users.set(su.userId, {
                     userId: su.userId,
                     username: su.username || String(su.userId),
                     name: su.name || null,
                     avatarUrl: null,
                     createdAt: null,
                     firstSeen: new Date().toISOString(),
                     lastSeen: new Date().toISOString(),
                     stats: null,
                     arcade: { arcadeWins: 0, arcadeLosses: 0, sessionWagered: 0, sessionWon: 0, sessionGamesPlayed: 0, sessionWins: 0, sessionLosses: 0 },
                     recentTransactions: [],
                     createdCoins: [],
                     flags: { isBanned: false, isAdmin: false, trustScore: null },
                     alt: { overallScore: 0, overallLabel: 'Unlikely', clusters: [], indicators: [] },
                     enrichedAt: null,
                 });
                 if (!usersToEnrich.find(u => u.userId === su.userId)) {
                     usersToEnrich.push(store.users.get(su.userId)!);
                 }
            }
        }
    }

    console.log(`Enriching ${usersToEnrich.length} users via API`);

    for (const user of usersToEnrich) {
        const cacheKey = String(user.userId);

        const userData = await throttledFetch(
            `https://rugplay.com/api/user/${user.userId}`
        );
        if (userData) {
            cache.users[cacheKey] = { data: userData, fetchedAt: new Date().toISOString() };
            saveCache(cache);
            parseUserApiResponse(userData, user);
        }



        user.enrichedAt = new Date().toISOString();
    }

    const coinsToEnrich = Array.from(store.coins.values()).filter(c =>
        needsCoinEnrichment(c, cache)
    );

    console.log(`Enriching ${coinsToEnrich.length} coins via API`);

    for (const coin of coinsToEnrich) {
        const coinData = await throttledFetch(
            `https://rugplay.com/api/coin/${coin.symbol}`
        );
        if (coinData) {
            cache.coins[coin.symbol] = { data: coinData, fetchedAt: new Date().toISOString() };
            saveCache(cache);
            parseCoinApiResponse(coinData, coin);
        }

        const holdersData = await throttledFetch(
            `https://rugplay.com/api/coin/${coin.symbol}/holders?limit=50`
        );
        if (holdersData) {
            parseCoinHoldersResponse(holdersData, coin);
        }

        coin.enrichedAt = new Date().toISOString();
    }

    
    const referencedIds = new Set<number>();
    for (const [, user] of store.users) {
        for (const ind of user.alt.indicators) {
            if (ind.candidateMainUserId && !store.users.has(ind.candidateMainUserId)) {
                referencedIds.add(ind.candidateMainUserId);
            }
        }
        
        for (const ind of user.alt.indicators) {
            const ownerId = ind.candidateMainUserId;
            if (ownerId) {
                const ownerUser = store.users.get(ownerId);
                if (ownerUser && !ownerUser.enrichedAt) {
                    referencedIds.add(ownerId);
                }
            }
        }
    }

    if (referencedIds.size > 0) {
        console.log(`P2: Enriching ${referencedIds.size} referenced mastermind(s)...`);
        for (const id of referencedIds) {
            
            if (!store.users.has(id)) {
                store.users.set(id, {
                    userId: id,
                    username: String(id),
                    name: null,
                    avatarUrl: null,
                    createdAt: null,
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    stats: null,
                    arcade: { arcadeWins: 0, arcadeLosses: 0, sessionWagered: 0, sessionWon: 0, sessionGamesPlayed: 0, sessionWins: 0, sessionLosses: 0 },
                    recentTransactions: [],
                    createdCoins: [],
                    flags: { isBanned: false, isAdmin: false, trustScore: null },
                    alt: { overallScore: 0, overallLabel: 'Unlikely', clusters: [], indicators: [] },
                    enrichedAt: null,
                });
            }

            const user = store.users.get(id)!;
            const userData = await throttledFetch(
                `https://rugplay.com/api/user/${id}`
            );
            if (userData) {
                cache.users[String(id)] = { data: userData, fetchedAt: new Date().toISOString() };
                saveCache(cache);
                parseUserApiResponse(userData, user);
            }
            user.enrichedAt = new Date().toISOString();
        }
    }

    console.log(`Enrichment complete. ${requestCount} total requests made.`);
}