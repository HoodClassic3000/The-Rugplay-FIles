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

const SIX_HOURS = 1000 * 60 * 60 * 6;
const SEVEN_DAYS = 1000 * 60 * 60 * 24 * 7;

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
    const entry = cache.users[String(user.userId)];
    if (!entry) return true;

    const age = Date.now() - new Date(entry.fetchedAt).getTime();


    if (user.alt.overallScore > 0 || user.alt.clusters.length > 0) return age > SIX_HOURS;


    const hoursSinceLastSeen = (Date.now() - new Date(user.lastSeen).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSeen < 24) return age > SIX_HOURS;


    return age > SEVEN_DAYS;
}

function needsCoinEnrichment(coin: CoinRecord, cache: EnrichmentCache): boolean {
    if (!coin.enrichedAt) return true;
    const entry = cache.coins[coin.symbol];
    if (!entry) return true;

    const age = Date.now() - new Date(entry.fetchedAt).getTime();

    if (!coin.createdAt) return age > SIX_HOURS;
    const hoursSinceCreated = (Date.now() - new Date(coin.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated < 48) return age > SIX_HOURS;


    return age > SEVEN_DAYS;
}

export async function enrichStore(store: InternalStore, cookie: string, limit?: number) {
    const cache = loadCache();
    let requestCount = 0;

    const mastermindIds = new Set<number>();
    for (const [, u] of store.users) {
        for (const ind of u.alt.indicators) {
            if (ind.candidateMainUserId) mastermindIds.add(ind.candidateMainUserId);
        }
    }

    function isHighPriority(user: UserRecord): boolean {
        if (user.alt.overallScore > 0) return true;
        if (user.alt.clusters.length > 0) return true;
        if (mastermindIds.has(user.userId)) return true;
        const hoursSinceLastSeen = (Date.now() - new Date(user.lastSeen).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSeen < 24) return true;
        return false;
    }

    function needsRefresh(user: UserRecord): boolean {
        if (!user.enrichedAt) return true;
        const entry = cache.users[String(user.userId)];
        if (!entry) return true;
        const age = Date.now() - new Date(entry.fetchedAt).getTime();
        if (isHighPriority(user)) return age > SIX_HOURS;
        return age > SEVEN_DAYS;
    }

    async function throttledFetch(url: string): Promise<unknown> {
        if (requestCount > 0) {
            await sleep(ENRICHMENT.requestCooldownMs);
        }
        requestCount++;
        console.log(`[${requestCount}] Fetching ${url}`);
        return fetchWithRetry(url, cookie);
    }

    let usersToEnrich = Array.from(store.users.values()).filter(u =>
        needsRefresh(u)
    );

    if (limit && usersToEnrich.length > limit) {
        usersToEnrich.sort((a, b) => {
            const aAge = cache.users[String(a.userId)] ? new Date(cache.users[String(a.userId)].fetchedAt).getTime() : 0;
            const bAge = cache.users[String(b.userId)] ? new Date(cache.users[String(b.userId)].fetchedAt).getTime() : 0;
            return aAge - bAge;
        });
        usersToEnrich = usersToEnrich.slice(0, limit);
        console.log(`Capping user enrichment to ${limit} via flag`);
    }

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

    let coinsToEnrich = Array.from(store.coins.values()).filter(c =>
        needsCoinEnrichment(c, cache)
    );

    if (limit && coinsToEnrich.length > limit) {
        coinsToEnrich.sort((a, b) => {
            const aAge = cache.coins[a.symbol] ? new Date(cache.coins[a.symbol].fetchedAt).getTime() : 0;
            const bAge = cache.coins[b.symbol] ? new Date(cache.coins[b.symbol].fetchedAt).getTime() : 0;
            return aAge - bAge;
        });
        coinsToEnrich = coinsToEnrich.slice(0, limit);
        console.log(`Capping coin enrichment to ${limit} via flag`);
    }

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