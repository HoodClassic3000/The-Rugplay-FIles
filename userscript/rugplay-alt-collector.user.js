// ==UserScript==
// @name         The Rugplay Files - Collector
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Passively collects trade, transfer, arcade and enrichment data for alt detection
// @author       HoodClassics
// @match        https://rugplay.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==
(function () {
    'use strict';

    const LOG_KEY = 'trf_collector_log';
    const QUEUE_KEY = 'trf_enrich_queue';
    const COIN_CACHE_KEY = 'trf_coin_cache';
    const BUYER_PATTERN_KEY = 'trf_buyer_patterns';
    const RECENT_BUYS_KEY = 'trf_recent_buys';
    const SEEN_USERS_KEY = 'trf_seen_users';
    const PENDING_TRANSFERS_KEY = 'trf_pending_transfers';
    const SETTINGS_KEY = 'trf_settings';
    const BALANCE_CACHE_KEY = 'trf_balance_cache';
    const CONSOLE_MAX_ENTRIES = 200;
    const MAX_SEEN_USERS = 5000;
    const RECENT_BUY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const TRANSFER_PAIR_WINDOW_MS = 5000;
    const STALE_TRANSFER_PRUNE_MS = 10000;
    const ACHIEVEMENT_BUY_MAX = 5;
    const ACHIEVEMENT_COINS_MIN = 6;
    const RECENT_ENRICH_COOLDOWN_MS = 5 * 60 * 1000;

    const DEFAULT_SETTINGS = {
        blacklistedUsers: [],
        largeBuyThreshold: 10000,
        mediumBuyThreshold: 1000,
        maxEvents: 10000,
        cooldownMs: 11000,
        resnapshotIntervalMs: 30 * 60 * 1000,
        collectionPaused: false,
    };

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return { ...DEFAULT_SETTINGS, ...saved };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    }

    const state = {
        events: JSON.parse(localStorage.getItem(LOG_KEY) || '[]'),
        queue: JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'),
        coinCache: JSON.parse(localStorage.getItem(COIN_CACHE_KEY) || '{}'),
        buyerPatterns: JSON.parse(localStorage.getItem(BUYER_PATTERN_KEY) || '{}'),
        recentBuys: new Map(JSON.parse(localStorage.getItem(RECENT_BUYS_KEY) || '[]')),
        seenUsers: new Map(JSON.parse(localStorage.getItem(SEEN_USERS_KEY) || '[]')),
        processingQueue: false,
        lastRequestTime: 0,
        pendingTransferOuts: JSON.parse(localStorage.getItem(PENDING_TRANSFERS_KEY) || '[]'),
        sessionStart: Date.now(),
        settings: loadSettings(),
        consoleBuffer: [],
        userBalanceCache: JSON.parse(localStorage.getItem(BALANCE_CACHE_KEY) || '{}'),
    };

    function persist() {
        try {
            const maxEvents = getSetting('maxEvents');
            if (state.events.length > maxEvents) {
                state.events = state.events.slice(state.events.length - maxEvents);
            }
            pruneRecentBuys();
            capSeenUsers();
            localStorage.setItem(LOG_KEY, JSON.stringify(state.events));
            localStorage.setItem(QUEUE_KEY, JSON.stringify(state.queue));
            localStorage.setItem(COIN_CACHE_KEY, JSON.stringify(state.coinCache));
            localStorage.setItem(BUYER_PATTERN_KEY, JSON.stringify(state.buyerPatterns));
            localStorage.setItem(RECENT_BUYS_KEY, JSON.stringify(Array.from(state.recentBuys.entries())));
            localStorage.setItem(SEEN_USERS_KEY, JSON.stringify(Array.from(state.seenUsers.entries())));
            localStorage.setItem(PENDING_TRANSFERS_KEY, JSON.stringify(state.pendingTransferOuts));
            localStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(state.userBalanceCache));
        } catch (e) {
            console.error('[TRF] Persist error (quota exceeded or circular ref):', e);
        }
    }

    function pruneRecentBuys() {
        const now = Date.now();
        for (const [key, entry] of state.recentBuys) {
            if (now - (entry.timestamp || entry.receivedAt || 0) > RECENT_BUY_MAX_AGE_MS) {
                state.recentBuys.delete(key);
            }
        }
    }

    function capSeenUsers() {
        if (state.seenUsers.size <= MAX_SEEN_USERS) return;
        const entries = Array.from(state.seenUsers.entries())
            .sort((a, b) => (b[1].lastSnapshotAt || b[1].firstSeenAt) - (a[1].lastSnapshotAt || a[1].firstSeenAt));
        state.seenUsers = new Map(entries.slice(0, MAX_SEEN_USERS));
    }

    function pushEvent(type, payload) {
        state.events.push({ type, ts: Date.now(), payload });
        persist();
    }

    function tryParse(data) {
        if (typeof data !== 'string') return data;
        try { return JSON.parse(data); } catch { return null; }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getSetting(key) {
        return state.settings[key] ?? DEFAULT_SETTINGS[key];
    }

    function isBlacklisted(userId, username) {
        const blacklist = getSetting('blacklistedUsers');
        if (!blacklist || blacklist.length === 0) return false;

        const uid = String(userId);
        const uname = String(username).toLowerCase();

        return blacklist.some(entry => {
            const strEntry = String(entry).toLowerCase();
            return strEntry === uid || strEntry === uname;
        });
    }

    function logConsole(msg, isError = false) {
        const entry = { ts: Date.now(), msg, isError };
        state.consoleBuffer.push(entry);
        if (state.consoleBuffer.length > CONSOLE_MAX_ENTRIES) {
            state.consoleBuffer.shift();
        }

        const statusEl = document.getElementById('trf-status-log');
        if (statusEl) {
            statusEl.textContent = `Status: ${msg}`;
            statusEl.style.color = isError ? '#ef4444' : '#10b981';
        }
    }

    function enqueueRequest(task) {
        if (!task || !task.url) return;

        if (task.userId && isBlacklisted(task.userId, null)) {
            logConsole(`Skipped ${task.type} enrich (blacklisted user ${task.userId})`);
            return;
        }

        const uid = String(task.userId);
        if (task.userId && state.seenUsers.has(uid)) {
            const entry = state.seenUsers.get(uid);
            const now = Date.now();
            if (entry.lastSnapshotAt && (now - entry.lastSnapshotAt) < RECENT_ENRICH_COOLDOWN_MS) {
                return;
            }
        }

        try {
            const existingIdx = state.queue.findIndex(t => t && t.url === task.url);
            if (existingIdx !== -1) {
                const existing = state.queue[existingIdx];
                if (task.trigger && existing.trigger && !existing.trigger.includes(task.trigger)) {
                    existing.trigger = `${existing.trigger},${task.trigger}`;
                    persist();
                }
            } else {
                state.queue.push(task);
                persist();
            }
        } catch (e) {
            console.error('[TRF] Error enqueueing request:', e);
            logConsole('Failed to queue enrichment task', true);
        }
        drainQueue();
    }

    async function drainQueue() {
        if (state.processingQueue || state.queue.length === 0) return;
        state.processingQueue = true;

        try {
            const cooldownMs = getSetting('cooldownMs');
            while (state.queue.length > 0) {
                if (getSetting('collectionPaused')) {
                    break;
                }

                const now = Date.now();
                const elapsed = now - state.lastRequestTime;
                if (elapsed < cooldownMs) {
                    logConsole(`Waiting ${Math.round((cooldownMs - elapsed) / 1000)}s for API limit...`);
                    await sleep(cooldownMs - elapsed);
                }

                const task = state.queue.shift();
                if (!task || !task.url) continue;

                try {
                    persist();
                } catch (e) {
                    console.error('[TRF] Persist crashed during drain:', e);
                }

                try {
                    logConsole(`Fetching ${task.type} (${task.userId || task.coinSymbol})...`);
                    const res = await fetch(task.url, { credentials: 'include' });
                    if (res.ok) {
                        const data = await res.json();
                        handleEnrichmentResponse(task, data);
                        logConsole(`Enriched ${task.type} successfully.`);
                    } else {
                        logConsole(`HTTP ${res.status} on ${task.type}`, true);
                    }
                } catch (e) {
                    console.warn('[TRF] Enrichment fetch failed:', task.url, e);
                    logConsole(`Error fetching ${task.type}`, true);
                }

                state.lastRequestTime = Date.now();

                try {
                    updateCounts();
                } catch (e) { }
            }
        } catch (e) {
            console.error('[TRF] Fatal error in drainQueue process loop', e);
            logConsole(`Pipeline error: ${e.message}`, true);
        } finally {
            if (state.queue.length === 0 && !getSetting('collectionPaused')) {
                logConsole(`Listening for events...`);
            } else if (getSetting('collectionPaused')) {
                logConsole(`Collection paused`);
            }
            state.processingQueue = false;
        }
    }

    function handleEnrichmentResponse(task, data) {
        if (task.type === 'holders') {
            pushEvent('enriched_snapshot', {
                trigger: task.trigger,
                coinSymbol: task.coinSymbol,
                userId: task.userId ?? null,
                holdersSnapshot: data.holders ?? null,
                poolInfo: data.poolInfo ?? null,
                userSnapshot: null,
                capturedAt: new Date().toISOString(),
            });
        }

        if (task.type === 'user') {
            const profile = data.profile ?? null;
            const stats = data.stats ?? null;
            const recentTransactions = data.recentTransactions ?? [];
            const createdCoins = data.createdCoins ?? [];
            const loginStreak = data.loginStreak ?? null;
            const totalEarned = data.totalEarned ?? null;


            if (task.userId && stats && stats.baseCurrencyBalance !== undefined) {
                state.userBalanceCache[String(task.userId)] = {
                    balance: Number(stats.baseCurrencyBalance),
                    capturedAt: Date.now(),
                };
            }

            pushEvent('enriched_snapshot', {
                trigger: task.trigger,
                coinSymbol: task.coinSymbol ?? null,
                userId: task.userId,
                holdersSnapshot: null,
                poolInfo: null,
                userSnapshot: {
                    stats,
                    recentTransactions,
                    createdCoins,
                    profile,
                    loginStreak,
                    totalEarned
                },
                capturedAt: new Date().toISOString(),
            });

            if (task.userId) {
                const entry = state.seenUsers.get(String(task.userId));
                if (entry) {
                    entry.lastSnapshotAt = Date.now();
                    entry.enrichedAt = new Date().toISOString();
                }
            }
        }

        if (task.type === 'coin') {
            const coin = data.coin ?? data ?? null;
            if (coin && task.coinSymbol) {
                state.coinCache[task.coinSymbol] = {
                    creatorId: coin.creatorId ?? null,
                    coinId: coin.id ?? null,
                    name: coin.name ?? null,
                    cachedAt: Date.now(),
                };
                persist();

                pushEvent('coin_info', {
                    trigger: task.trigger,
                    coinSymbol: task.coinSymbol,
                    creatorId: coin.creatorId ?? null,
                    coinId: coin.id ?? null,
                    name: coin.name ?? null,
                    capturedAt: new Date().toISOString(),
                });
            }
        }
    }

    function getOrFetchCoinCreator(coinSymbol) {
        const cached = state.coinCache[coinSymbol];
        if (cached && cached.creatorId) return cached.creatorId;

        if (!cached) {
            enqueueRequest({
                url: `https://rugplay.com/api/coin/${coinSymbol}`,
                type: 'coin',
                trigger: 'creator_lookup',
                coinSymbol,
            });
        }

        return null;
    }

    function updateBuyerPattern(userId, coinSymbol, type) {
        if (type !== 'BUY') return;
        const uid = String(userId);
        if (!state.buyerPatterns[uid]) {
            state.buyerPatterns[uid] = {
                totalBuys: 0,
                coinBuyCounts: {},
                creatorBuyCounts: {},
            };
        }

        const pattern = state.buyerPatterns[uid];
        pattern.totalBuys++;

        if (!pattern.coinBuyCounts[coinSymbol]) pattern.coinBuyCounts[coinSymbol] = 0;
        pattern.coinBuyCounts[coinSymbol]++;

        const creatorId = state.coinCache[coinSymbol]?.creatorId;
        if (creatorId) {
            const ck = String(creatorId);
            if (!pattern.creatorBuyCounts[ck]) pattern.creatorBuyCounts[ck] = 0;
            pattern.creatorBuyCounts[ck]++;
        }

        persist();
        checkBuyerPatternFlags(uid);
    }

    function checkBuyerPatternFlags(uid) {
        const pattern = state.buyerPatterns[uid];
        if (!pattern || pattern.totalBuys < 5) return;

        for (const [creatorId, count] of Object.entries(pattern.creatorBuyCounts)) {
            const ratio = count / pattern.totalBuys;
            if (ratio >= 0.9) {
                pushEvent('flag_single_creator_buyer', {
                    userId: uid,
                    creatorId,
                    buyRatio: ratio,
                    totalBuys: pattern.totalBuys,
                    creatorBuys: count,
                    detectedAt: new Date().toISOString(),
                });
            }
        }

        const uniqueCoins = Object.keys(pattern.coinBuyCounts).length;
        const allSmall = Object.values(pattern.coinBuyCounts).every(
            c => c <= ACHIEVEMENT_BUY_MAX
        );
        if (uniqueCoins >= ACHIEVEMENT_COINS_MIN && allSmall) {
            pushEvent('flag_achievement_farmer', {
                userId: uid,
                uniqueCoins,
                buyDistribution: pattern.coinBuyCounts,
                detectedAt: new Date().toISOString(),
            });
        }
    }

    function trackSeenUser(userId, username) {
        const uid = String(userId);
        if (!state.seenUsers.has(uid)) {
            state.seenUsers.set(uid, {
                username,
                firstSeenAt: Date.now(),
                lastSnapshotAt: 0,
                enrichedAt: null,
            });
            persist();
        }
    }

    function onTrade(trade) {
        const { userId, username, coinSymbol, totalValue, type } = trade;

        if (isBlacklisted(userId, username)) return;

        trackSeenUser(userId, username);
        updateBuyerPattern(userId, coinSymbol, type);
        getOrFetchCoinCreator(coinSymbol);

        if (type === 'BUY') {
            const largeThresh = getSetting('largeBuyThreshold');
            const mediumThresh = getSetting('mediumBuyThreshold');

            if (totalValue >= largeThresh) {
                onLargeBuy(trade);
            } else if (totalValue >= mediumThresh) {
                enqueueRequest({
                    url: `https://rugplay.com/api/user/${userId}`,
                    type: 'user',
                    trigger: 'medium_buy',
                    coinSymbol,
                    userId,
                });
            }
        }

        if (type === 'SELL') {
            onSell(trade);
        }
    }

    function onLargeBuy(trade) {
        const { userId, coinSymbol } = trade;
        const buyKey = `${userId}:${coinSymbol}`;


        const cachedBalance = state.userBalanceCache[String(userId)];
        const buyerBalanceBefore = cachedBalance ? cachedBalance.balance : null;

        state.recentBuys.set(buyKey, {
            amount: trade.totalValue,
            timestamp: trade.timestamp || Date.now(),
            price: trade.price,
            buyerBalanceBefore,
        });
        persist();

        enqueueRequest({
            url: `https://rugplay.com/api/coin/${coinSymbol}/holders?limit=50`,
            type: 'holders',
            trigger: 'large_buy',
            coinSymbol,
            userId,
        });

        enqueueRequest({
            url: `https://rugplay.com/api/user/${userId}`,
            type: 'user',
            trigger: 'large_buy',
            coinSymbol,
            userId,
        });
    }

    function onSell(trade) {
        const { userId, coinSymbol, totalValue } = trade;
        const buyKey = `${userId}:${coinSymbol}`;
        const priorBuy = state.recentBuys.get(buyKey);

        if (!priorBuy) return;

        const returnRatio = totalValue / priorBuy.amount;
        if (returnRatio > 0.05) return;

        state.recentBuys.delete(buyKey);
        persist();

        pushEvent('flag_rug_victim', {
            userId,
            coinSymbol,
            buyAmount: priorBuy.amount,
            sellAmount: totalValue,
            returnRatio,
            detectedAt: new Date().toISOString(),
        });

        enqueueRequest({
            url: `https://rugplay.com/api/coin/${coinSymbol}/holders?limit=50`,
            type: 'holders',
            trigger: 'post_rug_sell',
            coinSymbol,
            userId,
        });

        enqueueRequest({
            url: `https://rugplay.com/api/user/${userId}`,
            type: 'user',
            trigger: 'post_rug_sell',
            coinSymbol,
            userId,
        });
    }

    function onTransferOut(trade) {

        const cachedBalance = state.userBalanceCache[String(trade.userId)];
        const senderBalanceBefore = cachedBalance ? cachedBalance.balance : null;

        state.pendingTransferOuts.push({
            fromUserId: String(trade.userId),
            fromUsername: trade.username,
            coinSymbol: trade.coinSymbol,
            totalValue: trade.totalValue,
            timestamp: trade.timestamp,
            receivedAt: Date.now(),
            senderBalanceBefore,
        });

        trackSeenUser(trade.userId, trade.username);

        enqueueRequest({
            url: `https://rugplay.com/api/user/${trade.userId}`,
            type: 'user',
            trigger: 'transfer_out',
            coinSymbol: trade.coinSymbol,
            userId: trade.userId,
        });
    }

    function onTransferIn(trade) {
        const now = Date.now();
        trackSeenUser(trade.userId, trade.username);

        const matchIndex = state.pendingTransferOuts.findIndex(p =>
            p.coinSymbol === trade.coinSymbol &&
            p.totalValue === trade.totalValue &&
            (now - p.receivedAt) <= TRANSFER_PAIR_WINDOW_MS
        );

        if (matchIndex !== -1) {
            const matched = state.pendingTransferOuts.splice(matchIndex, 1)[0];
            pushEvent('transfer_pair', {
                senderId: matched.fromUserId,
                senderUsername: matched.fromUsername,
                recipientId: String(trade.userId),
                recipientUsername: trade.username,
                coinSymbol: trade.coinSymbol,
                amount: trade.totalValue,
                timestamp: trade.timestamp,
                senderBalanceBefore: matched.senderBalanceBefore ?? null,
            });

            enqueueRequest({
                url: `https://rugplay.com/api/user/${trade.userId}`,
                type: 'user',
                trigger: 'transfer_in',
                coinSymbol: trade.coinSymbol,
                userId: trade.userId,
            });
        } else {
            pushEvent('transfer_unmatched', {
                direction: 'IN',
                userId: String(trade.userId),
                username: trade.username,
                coinSymbol: trade.coinSymbol,
                totalValue: trade.totalValue,
                timestamp: trade.timestamp,
            });
        }
    }

    function pruneStaleTransferOuts() {
        const now = Date.now();
        for (let i = state.pendingTransferOuts.length - 1; i >= 0; i--) {
            if (now - state.pendingTransferOuts[i].receivedAt > STALE_TRANSFER_PRUNE_MS) {
                const stale = state.pendingTransferOuts.splice(i, 1)[0];
                pushEvent('transfer_unmatched', {
                    direction: 'OUT',
                    userId: stale.fromUserId,
                    username: stale.fromUsername,
                    coinSymbol: stale.coinSymbol,
                    totalValue: stale.totalValue,
                    timestamp: stale.timestamp,
                });
            }
        }
    }

    function rescheduleUserSnapshots() {
        if (getSetting('collectionPaused')) return;
        const now = Date.now();
        const intervalMs = getSetting('resnapshotIntervalMs');
        for (const [uid, entry] of state.seenUsers.entries()) {
            if (isBlacklisted(uid, entry.username)) continue;
            const staleness = now - entry.lastSnapshotAt;
            if (staleness >= intervalMs) {
                enqueueRequest({
                    url: `https://rugplay.com/api/user/${uid}`,
                    type: 'user',
                    trigger: 'periodic_resnapshot',
                    coinSymbol: null,
                    userId: uid,
                });
            }
        }
    }

    function handleWsMessage(event) {
        if (getSetting('collectionPaused')) return;
        const msg = tryParse(event.data);
        if (!msg) return;

        if ((msg.type === 'all-trades' || msg.type === 'live-trade' || msg.type === 'all-transfers' || msg.type === 'live-transfer' || msg.type === 'notification' || (msg.type && msg.type.includes('transfer'))) && msg.data) {
            const d = msg.data;

            const userId = d.userId || d.fromUserId || d.toUserId || null;
            const username = d.username || d.fromUsername || d.toUsername || null;

            if (userId && isBlacklisted(userId, username)) return;

            const eventType = d.type || (msg.type.includes('transfer') ? (d.amount > 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT') : 'UNKNOWN');

            pushEvent('trade', {
                tradeType: eventType,
                wsMsgType: msg.type,
                userId: String(userId),
                username: username,
                coinSymbol: d.coinSymbol || null,
                coinName: d.coinName || null,
                amount: d.amount || 0,
                totalValue: d.totalValue || d.amount || 0,
                price: d.price || 0,
                timestamp: d.timestamp || Date.now(),
            });

            if (eventType === 'BUY' || eventType === 'SELL') onTrade(d);

            if (eventType === 'TRANSFER_OUT' || (msg.type.includes('transfer') && d.direction === 'OUT')) {
                const syntheticTrade = {
                    userId: userId,
                    username: username,
                    coinSymbol: d.coinSymbol || 'USD',
                    totalValue: d.totalValue || d.amount || 0,
                    timestamp: d.timestamp || Date.now()
                };
                onTransferOut(syntheticTrade);
            }
            if (eventType === 'TRANSFER_IN' || (msg.type.includes('transfer') && d.direction === 'IN')) {
                const syntheticTrade = {
                    userId: userId,
                    username: username,
                    coinSymbol: d.coinSymbol || 'USD',
                    totalValue: d.totalValue || d.amount || 0,
                    timestamp: d.timestamp || Date.now()
                };
                onTransferIn(syntheticTrade);
            }
        }
    }

    const OrigWS = unsafeWindow.WebSocket;
    unsafeWindow.WebSocket = new Proxy(OrigWS, {
        construct(target, args) {
            const ws = new target(...args);
            ws.addEventListener('message', handleWsMessage);
            return ws;
        }
    });

    const origFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input?.url;
        const method = (init.method || 'GET').toUpperCase();
        const res = await origFetch.call(this, input, init);

        if (method === 'POST' && url && url.includes('/api/transfer')) {
            res.clone().text().then(text => {
                const data = tryParse(text);
                if (!data || !data.success) return;
                if (data.recipientUserId) {
                    enqueueRequest({
                        url: `https://rugplay.com/api/user/${data.recipientUserId}`,
                        type: 'user',
                        trigger: 'own_transfer_out',
                        coinSymbol: null,
                        userId: data.recipientUserId,
                    });
                }
            }).catch(() => { });
        }
        return res;
    };

    function exportLogs() {
        const payload = {
            exportedAt: new Date().toISOString(),
            sessionStart: new Date(state.sessionStart).toISOString(),
            eventCount: state.events.length,
            coinCacheSize: Object.keys(state.coinCache).length,
            seenUsersCount: state.seenUsers.size,
            events: state.events,
            coinCache: state.coinCache,
            buyerPatterns: state.buyerPatterns,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trf-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function clearLogs() {
        state.events = [];
        state.queue = [];
        state.recentBuys = new Map();
        state.pendingTransferOuts = [];
        state.seenUsers = new Map();
        state.buyerPatterns = {};
        state.coinCache = {};
        state.userBalanceCache = {};
        localStorage.removeItem(LOG_KEY);
        localStorage.removeItem(QUEUE_KEY);
        localStorage.removeItem(COIN_CACHE_KEY);
        localStorage.removeItem(BUYER_PATTERN_KEY);
        localStorage.removeItem(RECENT_BUYS_KEY);
        localStorage.removeItem(SEEN_USERS_KEY);
        localStorage.removeItem(PENDING_TRANSFERS_KEY);
        localStorage.removeItem(BALANCE_CACHE_KEY);
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function getStorageSize() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('trf_')) {
                total += (localStorage.getItem(key)?.length || 0) * 2;
            }
        }
        return total;
    }

    function renderSettingsModal() {
        let modal = document.getElementById('trf-settings-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'trf-settings-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif;backdrop-filter:blur(4px);';

        const content = document.createElement('div');
        content.style.cssText = 'background:#09090b;border:1px solid #27272a;border-radius:8px;width:90%;max-width:600px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;background:#09090b;';

        const title = document.createElement('h2');
        title.textContent = 'TRF Collector Settings';
        title.style.cssText = 'color:#fafafa;font-size:18px;font-weight:600;margin:0;';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'background:none;border:none;color:#a1a1aa;font-size:24px;cursor:pointer;padding:0;line-height:1;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:4px;';
        closeBtn.onmouseenter = () => closeBtn.style.background = '#27272a';
        closeBtn.onmouseleave = () => closeBtn.style.background = 'transparent';
        closeBtn.onclick = () => modal.remove();

        header.appendChild(title);
        header.appendChild(closeBtn);

        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;border-bottom:1px solid #27272a;background:#09090b;padding:0 12px;';

        const tabNames = ['General', 'Blacklist', 'Console'];
        let activeTab = 'General';
        const tabBtns = {};

        const body = document.createElement('div');
        body.style.cssText = 'padding:20px;overflow-y:auto;flex:1;background:#09090b;';

        const renderBody = () => {
            body.innerHTML = '';

            if (activeTab === 'General') {
                const fields = [
                    { key: 'largeBuyThreshold', label: 'Large Buy Target ($)', type: 'number' },
                    { key: 'mediumBuyThreshold', label: 'Medium Buy Target ($)', type: 'number' },
                    { key: 'maxEvents', label: 'Max Events Retained', type: 'number' },
                    { key: 'cooldownMs', label: 'API Cooldown (ms)', type: 'number' },
                    { key: 'resnapshotIntervalMs', label: 'Resnapshot Interval (ms)', type: 'number' }
                ];

                fields.forEach(f => {
                    const group = document.createElement('div');
                    group.style.cssText = 'margin-bottom:16px;';

                    const lbl = document.createElement('label');
                    lbl.textContent = f.label;
                    lbl.style.cssText = 'display:block;color:#a1a1aa;font-size:13px;margin-bottom:6px;font-weight:500;';

                    const inp = document.createElement('input');
                    inp.type = f.type;
                    inp.value = state.settings[f.key];
                    inp.style.cssText = 'width:100%;padding:8px 12px;background:#09090b;border:1px solid #27272a;border-radius:6px;color:#e4e4e7;font-size:14px;box-sizing:border-box;outline:none;transition:border-color 0.15s;';
                    inp.onfocus = () => { inp.style.borderColor = '#18181b'; };
                    inp.onblur = () => { inp.style.borderColor = '#27272a'; };
                    inp.onchange = (e) => {
                        state.settings[f.key] = Number(e.target.value);
                        saveSettings();
                    };

                    group.appendChild(lbl);
                    group.appendChild(inp);
                    body.appendChild(group);
                });

                const storageInfo = document.createElement('div');
                storageInfo.style.cssText = 'margin-top:24px;padding:12px;background:#18181b;border:1px solid #27272a;border-radius:6px;';
                storageInfo.innerHTML = `<p style="margin:0;color:#a1a1aa;font-size:13px;">Local Storage Used: <strong style="color:#e4e4e7;">${formatBytes(getStorageSize())}</strong> / ~500 MB</p>`;
                body.appendChild(storageInfo);
            }
            else if (activeTab === 'Blacklist') {
                const info = document.createElement('p');
                info.textContent = 'Blacklisted users (by exactly matching username or ID) are completely ignored by the collector. No logs, no patterns, no API hits.';
                info.style.cssText = 'color:#a1a1aa;font-size:13px;margin:0 0 16px 0;line-height:1.5;';
                body.appendChild(info);

                const addGroup = document.createElement('div');
                addGroup.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;';

                const inp = document.createElement('input');
                inp.placeholder = 'Enter Username or ID';
                inp.style.cssText = 'flex:1;padding:8px 12px;background:#09090b;border:1px solid #27272a;border-radius:6px;color:#e4e4e7;font-size:14px;outline:none;transition:border-color 0.15s;';
                inp.onfocus = () => { inp.style.borderColor = '#18181b'; };
                inp.onblur = () => { inp.style.borderColor = '#27272a'; };

                const addBtn = document.createElement('button');
                addBtn.textContent = 'Add';
                addBtn.style.cssText = 'padding:8px 16px;background:#fafafa;color:#09090b;border:none;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;transition:background 0.15s;';
                addBtn.onmouseenter = () => { addBtn.style.background = '#e4e4e7'; };
                addBtn.onmouseleave = () => { addBtn.style.background = '#fafafa'; };

                const handleAdd = () => {
                    const val = inp.value.trim();
                    if (val && !state.settings.blacklistedUsers.includes(val)) {
                        state.settings.blacklistedUsers.push(val);
                        saveSettings();
                        renderBody();
                    }
                };
                addBtn.onclick = handleAdd;
                inp.onkeypress = (e) => e.key === 'Enter' && handleAdd();

                addGroup.appendChild(inp);
                addGroup.appendChild(addBtn);
                body.appendChild(addGroup);

                const list = document.createElement('div');
                list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

                if (!state.settings.blacklistedUsers || state.settings.blacklistedUsers.length === 0) {
                    list.innerHTML = '<div style="color:#71717a;font-size:13px;font-style:italic;">No blacklisted users.</div>';
                } else {
                    state.settings.blacklistedUsers.forEach((user, idx) => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#09090b;padding:8px 12px;border-radius:6px;border:1px solid #27272a;';

                        const uName = document.createElement('span');
                        uName.textContent = user;
                        uName.style.cssText = 'color:#e4e4e7;font-size:13px;font-family:monospace;';

                        const rmBtn = document.createElement('button');
                        rmBtn.innerHTML = '&times;';
                        rmBtn.style.cssText = 'background:none;border:none;color:#ef4444;font-size:18px;cursor:pointer;line-height:1;padding:0 4px;';
                        rmBtn.onclick = () => {
                            state.settings.blacklistedUsers.splice(idx, 1);
                            saveSettings();
                            renderBody();
                        };

                        row.appendChild(uName);
                        row.appendChild(rmBtn);
                        list.appendChild(row);
                    });
                }
                body.appendChild(list);
            }
            else if (activeTab === 'Console') {
                const con = document.createElement('div');
                con.style.cssText = 'background:#000;border:1px solid #27272a;border-radius:6px;padding:12px;height:400px;overflow-y:auto;font-family:monospace;font-size:12px;';

                if (state.consoleBuffer.length === 0) {
                    con.innerHTML = '<span style="color:#71717a;">No logs yet...</span>';
                } else {
                    state.consoleBuffer.forEach(entry => {
                        const line = document.createElement('div');
                        line.style.cssText = `margin-bottom:4px;color:${entry.isError ? '#ef4444' : '#10b981'};`;
                        const time = new Date(entry.ts).toLocaleTimeString([], { hour12: false });
                        line.textContent = `[${time}] ${entry.msg}`;
                        con.appendChild(line);
                    });
                }
                body.appendChild(con);

                setTimeout(() => con.scrollTop = con.scrollHeight, 10);
            }
        };

        tabNames.forEach(name => {
            const tBtn = document.createElement('button');
            tBtn.textContent = name;
            tBtn.style.cssText = `padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;color:#71717a;font-size:13px;font-weight:500;cursor:pointer;outline:none;transition:color 0.1s, border-bottom-color 0.1s;`;
            if (name === activeTab) {
                tBtn.style.color = '#fafafa';
                tBtn.style.borderBottomColor = '#fafafa';
            } else {
                tBtn.onmouseenter = () => { tBtn.style.color = '#a1a1aa'; };
                tBtn.onmouseleave = () => { tBtn.style.color = '#71717a'; };
            }

            tBtn.onclick = () => {
                activeTab = name;
                Object.values(tabBtns).forEach((b, idx) => {
                    b.style.color = '#71717a';
                    b.style.borderBottomColor = 'transparent';
                    b.onmouseenter = () => { b.style.color = '#a1a1aa'; };
                    b.onmouseleave = () => { b.style.color = '#71717a'; };
                });
                tBtn.style.color = '#fafafa';
                tBtn.style.borderBottomColor = '#fafafa';
                tBtn.onmouseenter = null;
                tBtn.onmouseleave = null;
                renderBody();
            };
            tabBtns[name] = tBtn;
            tabs.appendChild(tBtn);
        });

        content.appendChild(header);
        content.appendChild(tabs);
        content.appendChild(body);
        modal.appendChild(content);
        document.body.appendChild(modal);

        renderBody();
    }

    function buildButton() {
        if (document.getElementById('trf-export-btn')) return;

        const nav = document.querySelector('div.relative.flex.w-full.min-w-0.flex-col.p-2');
        if (!nav) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'trf-export-btn';
        wrapper.style.cssText = 'padding:4px 8px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.08);';

        const label = document.createElement('p');
        label.textContent = 'The Rugplay Files';
        label.style.cssText = 'font-size:10px;color:#6b7280;padding:6px 8px 2px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;';

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export logs';
        exportBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;font-size:14px;color:#e5e7eb;background:transparent;border:none;border-radius:6px;cursor:pointer;';
        exportBtn.onmouseenter = () => { exportBtn.style.background = 'rgba(255,255,255,0.06)'; };
        exportBtn.onmouseleave = () => { exportBtn.style.background = 'transparent'; };
        exportBtn.addEventListener('click', exportLogs);

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = 'Settings';
        settingsBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;font-size:14px;color:#cbd5e1;background:transparent;border:none;border-radius:6px;cursor:pointer;margin-bottom:4px;';
        settingsBtn.onmouseenter = () => { settingsBtn.style.background = 'rgba(255,255,255,0.06)'; };
        settingsBtn.onmouseleave = () => { settingsBtn.style.background = 'transparent'; };
        settingsBtn.addEventListener('click', renderSettingsModal);

        const countLabel = document.createElement('p');
        countLabel.id = 'trf-event-count';
        countLabel.style.cssText = 'font-size:11px;color:#6b7280;padding:2px 8px 2px;';
        countLabel.textContent = `${state.events.length.toLocaleString()} events stored`;

        const queueLabel = document.createElement('p');
        queueLabel.id = 'trf-queue-count';
        queueLabel.style.cssText = 'font-size:11px;color:#6b7280;padding:0px 8px 1px;';

        const estLabel = document.createElement('p');
        estLabel.id = 'trf-queue-est';
        estLabel.style.cssText = 'font-size:10px;color:#4b5563;padding:0px 8px 4px;font-style:italic;';

        const seenLabel = document.createElement('p');
        seenLabel.id = 'trf-seen-count';
        seenLabel.style.cssText = 'font-size:11px;color:#6b7280;padding:0px 8px 4px;';
        seenLabel.textContent = `${state.seenUsers.size.toLocaleString()} users tracked`;

        const statusContainer = document.createElement('div');
        statusContainer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 8px 4px;';

        const statusLabel = document.createElement('p');
        statusLabel.id = 'trf-status-log';
        statusLabel.style.cssText = 'font-size:11px;color:#10b981;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;';
        statusLabel.textContent = `Status: Listening...`;

        const pauseBtn = document.createElement('button');
        pauseBtn.id = 'trf-pause-btn';
        pauseBtn.textContent = state.settings.collectionPaused ? '[Resume]' : '[Pause]';
        pauseBtn.title = state.settings.collectionPaused ? 'Resume collection' : 'Pause collection';
        pauseBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;padding:2px;color:#9ca3af;font-weight:600;';
        pauseBtn.onmouseenter = () => { pauseBtn.style.color = state.settings.collectionPaused ? '#10b981' : '#fbbf24'; };
        pauseBtn.onmouseleave = () => { pauseBtn.style.color = '#9ca3af'; };
        pauseBtn.onclick = () => {
            state.settings.collectionPaused = !state.settings.collectionPaused;
            pauseBtn.textContent = state.settings.collectionPaused ? '[Resume]' : '[Pause]';
            pauseBtn.title = state.settings.collectionPaused ? 'Resume collection' : 'Pause collection';
            saveSettings();
            if (!state.settings.collectionPaused) drainQueue();
            else logConsole('Collection paused');
        };

        statusContainer.appendChild(statusLabel);
        statusContainer.appendChild(pauseBtn);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear logs';
        clearBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;font-size:14px;color:#ef4444;background:transparent;border:none;border-radius:6px;cursor:pointer;margin-top:8px;';
        clearBtn.onmouseenter = () => { clearBtn.style.background = 'rgba(239,68,68,0.1)'; };
        clearBtn.onmouseleave = () => { clearBtn.style.background = 'transparent'; };
        clearBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to clear all local data? This cannot be undone.")) {
                clearLogs();
                updateCounts();
            }
        });

        wrapper.appendChild(label);
        wrapper.appendChild(exportBtn);
        wrapper.appendChild(settingsBtn);
        wrapper.appendChild(countLabel);
        wrapper.appendChild(queueLabel);
        wrapper.appendChild(estLabel);
        wrapper.appendChild(seenLabel);
        wrapper.appendChild(statusContainer);
        wrapper.appendChild(clearBtn);
        nav.appendChild(wrapper);

        setInterval(updateCounts, 3000);
    }

    function updateCounts() {
        const el = document.getElementById('trf-event-count');
        const ql = document.getElementById('trf-queue-count');
        const est = document.getElementById('trf-queue-est');
        const sl = document.getElementById('trf-seen-count');

        if (el) el.textContent = `${state.events.length.toLocaleString()} events (${formatBytes(getStorageSize())})`;

        if (ql) ql.textContent = `${state.queue.length} enrichment tasks queued`;
        if (est) {
            const ms = state.queue.length * getSetting('cooldownMs');
            if (ms > 0) {
                const mins = Math.ceil(ms / 60000);
                est.textContent = `~${mins}m drain time`;
            } else {
                est.textContent = '';
            }
        }

        if (sl) sl.textContent = `${state.seenUsers.size.toLocaleString()} users tracked`;
    }

    async function fetchHistoricalTradesOnStartup() {
        if (getSetting('collectionPaused')) return;
        try {
            logConsole('Fetching recent global trades/transfers...');
            const res = await fetch('https://rugplay.com/api/trades/recent?limit=100', { credentials: 'include' });
            if (!res.ok) {
                logConsole('Failed to fetch recent trades', true);
                return;
            }

            const data = await res.json();
            if (!data.trades || !Array.isArray(data.trades)) return;

            let addedCount = 0;
            const thresholdMs = Date.now() - (60 * 60 * 1000);

            const reversedTrades = data.trades.reverse();
            for (const d of reversedTrades) {
                if (d.timestamp < thresholdMs) continue;

                const isDuplicate = state.events.some(e =>
                    e.payload &&
                    e.payload.timestamp === d.timestamp &&
                    e.payload.userId === String(d.userId) &&
                    e.payload.tradeType === d.type
                );

                if (!isDuplicate) {
                    handleWsMessage({
                        data: JSON.stringify({
                            type: 'live-trade',
                            data: d
                        })
                    });
                    addedCount++;
                }
            }
            logConsole(`Backfilled ${addedCount} missed events from API`);
        } catch (e) {
            logConsole('Error backfilling trades', true);
            console.error('[TRF] Backfill error:', e);
        }
    }

    setInterval(pruneStaleTransferOuts, 1000);
    setInterval(rescheduleUserSnapshots, 5 * 60 * 1000);

    const navObserver = new MutationObserver(() => buildButton());
    navObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', buildButton);
    window.addEventListener('load', buildButton);

    fetchHistoricalTradesOnStartup();
    drainQueue();

})();