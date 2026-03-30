export type AltLabel = 'Unlikely' | 'Possible' | 'Likely' | 'Very Likely';
export type IndicatorType = 'cash_funnel' | 'repeated_draining_transfers' | 'draining_transfers' | 'rug_laundering' | 'single_creator_buyer' | 'arcade_laundering' | 'achievement_farmer';

export interface AltIndicator {
    type: IndicatorType;
    score: number;
    candidateMainUserId: number;
    candidateMainUsername?: string;
    details: Record<string, unknown>;
    evidenceTransactionIds?: (number | null)[];
    detectedAt: string;
    summary?: string;
}

export interface UserStats {
    baseCurrencyBalance: number;
    totalBuyVolume: number;
    totalSellVolume: number;
    totalPortfolioValue: number;
    holdingsValue: number;
    holdingsCount: number;
    coinsCreated: number;
    totalTransactions: number;
    transactions24h: number;
    buyVolume24h: number;
    sellVolume24h: number;
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

export interface PublicClusterDetail extends ClusterRecord {
    members: PublicUserSummary[];
}

export interface UsersIndex {
    generatedAt: string;
    totalUsers: number;
    totalClusters: number;
    users: PublicUserSummary[];
}