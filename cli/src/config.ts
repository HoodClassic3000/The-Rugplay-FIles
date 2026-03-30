import path from 'path';
import type { AltLabel } from './types';

export const SCORE_BANDS: { min: number; max: number; label: AltLabel }[] = [
    { min: 80, max: 100, label: 'Very Likely' },
    { min: 60, max: 79,  label: 'Likely' },
    { min: 35, max: 59,  label: 'Possible' },
    { min: 0,  max: 34,  label: 'Unlikely' },
];

export const MINIMUM_EVIDENCE_THRESHOLD = {
    singleRuleMinScore: 35,
    multiRuleMinScore: 10,
    multiRuleMinCount: 2,
};

export const ACCOUNT_AGE = {
    newAccountDays: 30,
    recentAccountDays: 60,
};

export const CASH_FUNNEL = {
    minTotalTransferred: 10_000,
    minTransferShareToFlag: 0.90,
    highTransferShare: 0.95,
    minSeparateTransferEvents: 3,
    scores: {
        createdThisMonth: 20,
        createdWithin30Days: 10,
        transferShareHigh: 15,
        transferShareVeryHigh: 30,
        repeatedTransferEvents: 5,
        fullDrainBonus: 25,
    },
};

export const COIN_FUNNEL = {
    minTransferValueUSD: 50_000,
    minBalanceDrainShare: 0.90,
    highBalanceDrainShare: 0.95,
    minSeparateTransferEvents: 3,
    scores: {
        createdThisMonth: 20,
        createdWithin30Days: 10,
        drainShareHigh: 15,
        drainShareVeryHigh: 30,
        repeatedTransferEvents: 10,
        fullDrainBonus: 25,
    },
};

export const RUG_LAUNDERING = {
    dominantHolderThreshold: 0.80,
    veryDominantHolderThreshold: 0.90,
    minBuyShareOfBalance: 0.80,
    maxSellReturnRatio: 0.05,
    maxHoursBetweenBuyAndRug: 72,
    scores: {
        singleSequence: 25,
        multipleSequencesCap: 35,
        veryDominantHolderBonus: 5,
        newAccountBonus: 5,
    },
};

export const SINGLE_CREATOR_BUYER = {
    minTrades: 5,
    minBuyShareToFlag: 0.90,
    highBuyShare: 0.95,
    highBuyShareMinTrades: 10,
    scores: {
        buyShareHigh: 10,
        buyShareVeryHigh: 20,
    },
};

export const DRAINING_TRANSFERS = {
    minDrainRatio: 0.80,
    minDrainingEventsShortWindow: 2,
    minDrainingEventsHighWindow: 4,
    windowDays: 30,
    scores: {
        twoOrMoreDrains: 10,
        fourOrMoreDrains: 20,
    },
};

export const ARCADE_LAUNDERING = {
    minLifetimeWinsToFlag: 2_000_000,
    largeWinSessionThreshold: 500_000,
    minArcadeActivityRatio: 0.70,
    maxHoldingsCount: 3,
    launderingLinkWindowDays: 7,
    minLaunderTransferShare: 0.60,
    scores: {
        arcadeDominantProfile: 10,
        lifetimeWinsAboveThreshold: 10,
        confirmedLaunderingLink: 15,
        newAccountBonus: 5,
    },
};

export const CLUSTER = {
    minSharedCandidateScore: 35,
    minMembersToForm: 2,
};

export const ENRICHMENT = {
    requestCooldownMs: 11_000,
    maxRetriesPerRequest: 3,
    retryBackoffMs: 15_000,
};

export const SNAPSHOT = {
    outputDir: path.resolve(__dirname, '../../snapshot'),
    usersSubDir: 'users',
    clustersSubDir: 'clusters',
    usersIndexFile: 'users-index.json',
};

export const LOGS = {
    inputDir: path.resolve(__dirname, '../../logs'),
    mockDir: path.resolve(__dirname, '../../mock/logs'),
};

export function resolveScoreLabel(score: number): AltLabel {
    for (const band of SCORE_BANDS) {
        if (score >= band.min && score <= band.max) return band.label;
    }
    return 'Unlikely';
}

export function capScore(score: number): number {
    return Math.min(Math.max(score, 0), 100);
}