export type TradeType = 'BUY' | 'SELL';
export type TransferDirection = 'TRANSFER_IN' | 'TRANSFER_OUT';
export type AltLabel = 'Unlikely' | 'Possible' | 'Likely' | 'Very Likely';
export type AltScoreLabel = AltLabel;

export type EventType =
    | 'trade'
    | 'transfer_pair'
    | 'transfer_unmatched'
    | 'transfer_rest'
    | 'arcade'
    | 'arcade_rest'
    | 'arcade_lifetime'
    | 'enriched_snapshot'
    | 'coin_info'
    | 'notification'
    | 'flag_rug_victim'
    | 'flag_single_creator_buyer'
    | 'flag_achievement_farmer';

export type IndicatorType =
    | 'cash_funnel'
    | 'coin_funnel'
    | 'repeated_draining_transfers'
    | 'draining_transfers'
    | 'rug_laundering'
    | 'single_holder_buyer'
    | 'arcade_laundering'
    | 'achievement_farmer'
    | 'mastermind_activity';

export type RelationshipType =
    | 'single_holder_buyer'
    | 'transfer_funnel'
    | 'rug_victim_to_owner'
    | 'arcade_launderer';


export interface RawEvent {
    type: EventType;
    ts: number;
    payload: unknown;
}

export interface RawExportFile {
    exportedAt: string;
    sessionStart: string;
    eventCount: number;
    coinCacheSize?: number;
    seenUsersCount?: number;
    events: RawEvent[];
    coinCache?: Record<string, CoinCacheEntry>;
    buyerPatterns?: Record<string, BuyerPattern>;
}

export interface RawTradeEvent extends RawEvent {
    type: 'trade';
    payload: {
        tradeType: TradeType;
        userId: number;
        username: string;
        coinSymbol: string;
        coinName: string;
        amount: number;
        totalValue: number;
        price: number;
        timestamp: number;
    };
}

export interface RawArcadeEvent extends RawEvent {
    type: 'arcade';
    payload: {
        userId: number;
        username: string;
        amount: number;
        won: boolean;
        game: string;
        timestamp: number;
    };
}

export interface RawEnrichedSnapshotEvent extends RawEvent {
    type: 'enriched_snapshot';
    payload: {
        trigger: string;
        coinSymbol: string | null;
        userId: number | null;
        holdersSnapshot: CoinHolder[] | null;
        poolInfo: PoolInfo | null;
        userSnapshot: RawUserSnapshot | null;
        capturedAt: string;
    };
}

export interface RawUserSnapshot {
    stats: UserStats | null;
    recentTransactions: unknown[];
    createdCoins: unknown[];
    profile: RawProfile | null;
}

export interface RawProfile {
    id: number;
    name: string;
    username: string;
    bio: string | null;
    image: string | null;
    createdAt: string | null;
    isBanned: boolean;
    isAdmin: boolean;
}


export interface TransactionRecord {
    id: number | null;
    type: 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
    coinSymbol: string | null;
    quantity: number;
    pricePerCoin: number;
    totalBaseCurrencyAmount: number;
    timestamp: string;
    recipientUserId: number | null;
    senderUserId: number | null;
    recipientUsername: string | null;
    senderUsername: string | null;
    senderHoldingsBefore?: number | null;
}

export interface UserStats {
    baseCurrencyBalance: number;
    buyVolume24h: number;
    coinsCreated: number;
    holdingsCount: number;
    holdingsValue: number;
    sellVolume24h: number;
    totalBuyVolume: number;
    totalPortfolioValue: number;
    totalSellVolume: number;
    totalTransactions: number;
    transactions24h: number;
}

export interface CoinHolder {
    userId: number;
    username: string;
    percentage: number;
    quantity: number;
    liquidationValue: number;
}

export interface PoolInfo {
    poolCoinAmount: number;
    poolBaseCurrencyAmount: number;
}

export interface CoinCacheEntry {
    creatorId: number | null;
    coinId: number | null;
    name: string | null;
    cachedAt: number;
}

export interface BuyerPattern {
    totalBuys: number;
    coinBuyCounts: Record<string, number>;
    creatorBuyCounts: Record<string, number>;
}


export interface AltIndicator {
    type: IndicatorType;
    score: number;
    candidateMainUserId: number;
    candidateMainUsername?: string;
    details: Record<string, unknown>;
    evidenceTransactionIds?: (number | null)[];
    detectedAt: string;
}

export interface UserArcadeStats {
    arcadeWins: number;
    arcadeLosses: number;
    sessionWagered: number;
    sessionWon: number;
    sessionGamesPlayed: number;
    sessionWins: number;
    sessionLosses: number;
}

export interface UserFlags {
    isBanned: boolean;
    isAdmin: boolean;
    trustScore: number | null;
    loginStreak?: number;
    prestigeLevel?: number;
    founderBadge?: boolean;
}

export interface UserAltData {
    overallScore: number;
    overallLabel: AltLabel;
    clusters: string[];
    indicators: AltIndicator[];
}

export interface UserRecord {
    userId: number;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
    firstSeen: string;
    lastSeen: string;
    stats: UserStats | null;
    arcade: UserArcadeStats;
    recentTransactions: TransactionRecord[];
    createdCoins: string[];
    flags: UserFlags;
    alt: UserAltData;
    enrichedAt: string | null;
}

export interface RelationshipRecord {
    fromUserId: number;
    toUserId: number;
    type: RelationshipType;
    weight: number;
    totalValueMoved: number;
    eventCount: number;
    firstSeen: string;
    lastSeen: string;
    evidence: RelationshipEvidence[];
}

export interface RelationshipEvidence {
    timestamp: string;
    kind: string;
    amount: number;
    coinSymbol: string | null;
    senderHoldingsBefore?: number | null;
}

export interface CoinRecord {
    symbol: string;
    coinId: number | null;
    name: string;
    creatorId: number | null;
    createdAt: string | null;
    currentPrice: number | null;
    marketCap: number | null;
    holders: CoinHolder[];
    rugEvents: RugEvent[];
    enrichedAt: string | null;
}

export interface RugEvent {
    timestamp: number;
    userId: number;
    coinSymbol: string;
    lossRatio: number;
    lossAmount: number;
}

export interface ClusterOwnerCandidate {
    userId: number;
    username: string;
    confidence: number;
}

export interface ClusterMetrics {
    totalAlts: number;
    totalTransferred: number;
    totalRugProfit: number;
    totalArcadeLaundered: number;
    oldestFirstSeen: string;
    newestFirstSeen: string;
}

export interface ClusterRecord {
    clusterId: string;
    ownerCandidates: ClusterOwnerCandidate[];
    memberUserIds: number[];
    metrics: ClusterMetrics;
    createdAt: string;
    updatedAt: string;
}

export interface InternalStore {
    users: Map<number, UserRecord>;
    coins: Map<string, CoinRecord>;
    relationships: Map<string, RelationshipRecord>;
    clusters: Map<string, ClusterRecord>;
}


export interface PublicUserSummary {
    userId: number;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    firstSeen: string;
    overallScore: number;
    overallLabel: AltLabel;
    clusterId: string | null;
    isBanned: boolean;
    isMastermind?: boolean;
    mastermindScore?: number;
}

export interface SuspectedOwnerEntry {
    userId: number;
    username: string;
    confidence: number;
}

export interface PublicRelationshipEntry {
    toUserId: number;
    toUsername: string;
    type: IndicatorType;
    weight: number;
    totalValueMoved: number;
}

export interface PublicAltIndicator extends AltIndicator {
    summary: string;
}

export interface PublicUserDetail extends PublicUserSummary {
    createdAt: string | null;
    stats: UserStats | null;
    arcade: UserArcadeStats;
    createdCoins: string[];
    indicators: PublicAltIndicator[];
    relationships: PublicRelationshipEntry[];
    suspectedOwners: SuspectedOwnerEntry[];
}

export interface PublicClusterDetail extends ClusterRecord {
    members: PublicUserSummary[];
}

export interface UsersIndex {
    generatedAt: string;
    totalUsers: number;
    totalClusters: number;
    users: PublicUserSummary[];
}