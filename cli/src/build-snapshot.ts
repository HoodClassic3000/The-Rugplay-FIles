import fs from 'fs';
import path from 'path';
import type {
    InternalStore,
    UserRecord,
    ClusterRecord,
    PublicUserSummary,
    PublicUserDetail,
    PublicClusterDetail,
    UsersIndex,
    AltIndicator,
    IndicatorType,
} from './types';
import {
    SNAPSHOT,
    CLUSTER,
    MINIMUM_EVIDENCE_THRESHOLD,
    resolveScoreLabel,
    capScore,
} from './config';
import { scoreCashFunnel } from './scoring/cash-funnel';
import { scoreRugLaundering } from './scoring/rug-laundering';
import { scoreSingleCreatorBuyer } from './scoring/single-creator-buyer';
import { scoreDrainingTransfers } from './scoring/draining-transfers';
import { scoreArcadeLaundering } from './scoring/arcade-laundering';

function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeJson(filePath: string, data: unknown) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function scoreUser(user: UserRecord, store: InternalStore, allUsers: UserRecord[]): AltIndicator[] {
    const candidateMainUserIds = new Set<number>();
    return [
        ...scoreCashFunnel(user, candidateMainUserIds, allUsers),
        ...scoreRugLaundering(user, store.coins, candidateMainUserIds, allUsers),
        ...scoreSingleCreatorBuyer(user, store.coins, candidateMainUserIds),
        ...scoreDrainingTransfers(user, candidateMainUserIds),
        ...scoreArcadeLaundering(user, store.coins, candidateMainUserIds, allUsers),
    ];
}

function meetsEvidenceThreshold(indicators: AltIndicator[]): boolean {
    if (indicators.length === 0) return false;
    const qualifying = indicators.filter(
        ind => ind.score >= MINIMUM_EVIDENCE_THRESHOLD.multiRuleMinScore
    );
    if (qualifying.length >= MINIMUM_EVIDENCE_THRESHOLD.multiRuleMinCount) return true;
    return indicators.some(
        ind => ind.score >= MINIMUM_EVIDENCE_THRESHOLD.singleRuleMinScore
    );
}

function computeOverallScore(indicators: AltIndicator[]): number {
    if (indicators.length === 0) return 0;
    return capScore(indicators.reduce((sum, ind) => sum + ind.score, 0));
}

function resolveOwnerScores(indicators: AltIndicator[]): Map<number, number> {
    const ownerScores = new Map<number, number>();
    for (const ind of indicators) {
        const existing = ownerScores.get(ind.candidateMainUserId) || 0;
        ownerScores.set(ind.candidateMainUserId, existing + ind.score);
    }
    return ownerScores;
}

function buildClusterId(ownerUserId: number): string {
    return `cluster_${ownerUserId}`;
}

function buildClusters(store: InternalStore): Map<string, ClusterRecord> {
    const clusters = new Map<string, ClusterRecord>();
    const ownerToMembers = new Map<number, number[]>();

    for (const [userId, user] of store.users) {
        if (!meetsEvidenceThreshold(user.alt.indicators)) continue;

        const ownerScores = resolveOwnerScores(user.alt.indicators);

        for (const [ownerId, score] of ownerScores) {
            if (score < CLUSTER.minSharedCandidateScore) continue;
            if (ownerId === userId) continue;
            const members = ownerToMembers.get(ownerId) || [];
            if (!members.includes(userId)) members.push(userId);
            ownerToMembers.set(ownerId, members);
        }
    }

    for (const [ownerId, memberIds] of ownerToMembers) {
        if (memberIds.length < CLUSTER.minMembersToForm) continue;

        const clusterId = buildClusterId(ownerId);
        const ownerUser = store.users.get(ownerId);

        const ownerConfidence = capScore(
            memberIds.reduce((sum, memberId) => {
                const member = store.users.get(memberId);
                if (!member) return sum;
                return sum + member.alt.indicators
                    .filter(ind => ind.candidateMainUserId === ownerId)
                    .reduce((s, ind) => s + ind.score, 0);
            }, 0)
        );

        const totalTransferred = memberIds.reduce((sum, memberId) => {
            const member = store.users.get(memberId);
            if (!member) return sum;
            return sum + member.alt.indicators
                .filter(ind => ind.candidateMainUserId === ownerId && ind.type === 'cash_funnel')
                .reduce((s, ind) => s + (Number(ind.details.totalTransferred) || 0), 0);
        }, 0);

        const totalRugProfit = memberIds.reduce((sum, memberId) => {
            const member = store.users.get(memberId);
            if (!member) return sum;
            return sum + member.alt.indicators
                .filter(ind => ind.candidateMainUserId === ownerId && ind.type === 'rug_laundering')
                .reduce((s, ind) => s + (Number(ind.details.totalLost) || 0), 0);
        }, 0);

        const totalArcadeLaundered = memberIds.reduce((sum, memberId) => {
            const member = store.users.get(memberId);
            if (!member) return sum;
            return sum + member.alt.indicators
                .filter(ind => ind.candidateMainUserId === ownerId && ind.type === 'arcade_laundering')
                .reduce((s, ind) => s + (Number(ind.details.totalLaundered) || 0), 0);
        }, 0);

        const firstSeens = memberIds
            .map(id => store.users.get(id)?.firstSeen)
            .filter((s): s is string => typeof s === 'string')
            .sort();

        const now = new Date().toISOString();

        const cluster: ClusterRecord = {
            clusterId,
            ownerCandidates: [
                {
                    userId: ownerId,
                    username: ownerUser?.username ?? String(ownerId),
                    confidence: ownerConfidence,
                },
            ],
            memberUserIds: memberIds,
            metrics: {
                totalAlts: memberIds.length,
                totalTransferred,
                totalRugProfit,
                totalArcadeLaundered,
                oldestFirstSeen: firstSeens[0] ?? now,
                newestFirstSeen: firstSeens[firstSeens.length - 1] ?? now,
            },
            createdAt: now,
            updatedAt: now,
        };

        clusters.set(clusterId, cluster);

        for (const memberId of memberIds) {
            const member = store.users.get(memberId);
            if (member && !member.alt.clusters.includes(clusterId)) {
                member.alt.clusters.push(clusterId);
            }
        }
    }

    return clusters;
}

function buildIndicatorSummary(indicator: AltIndicator): string {
    const d = indicator.details;

    if (indicator.type === 'cash_funnel') {
        const balancePct = d.balanceShare ? `${Math.round(Number(d.balanceShare) * 100)}% of total wealth` : `${Math.round(Number(d.transferShare) * 100)}% of outgoing funds`;
        return `Transferred ${balancePct} ($${Number(d.totalTransferred).toLocaleString()}) to one account across ${d.eventCount} transfer(s). Account age: ${d.accountAgeDays} days.`;
    }

    if (indicator.type === 'rug_laundering') {
        return `Bought into a coin dominated by a single holder and was rugged across ${d.sequenceCount} sequence(s), losing a total of ${Number(d.totalLost).toFixed(0)} in-game currency.`;
    }

    if (indicator.type === 'single_creator_buyer') {
        const seqCount = d.rugSequenceCount ?? d.tradeCount ?? 0;
        return `Rugged ${seqCount} time(s) buying coins from the same creator, losing a total of $${Number(d.totalLost ?? 0).toLocaleString()}.`;
    }

    if (indicator.type === 'draining_transfers') {
        return `Sent ${d.drainingEventCount} near-total balance transfers to the same recipient within ${d.windowDays} days.`;
    }

    if (indicator.type === 'arcade_laundering') {
        return `Arcade-dominant account with lifetime wins of ${Number(d.lifetimeWins).toFixed(0)}. Laundering link confirmed via ${Array.isArray(d.launderingLinks) ? d.launderingLinks.map((l: Record<string, unknown>) => l.method).join(', ') : 'unknown method'}.`;
    }

    return 'Flagged by automated detection.';
}

function toPublicSummary(user: UserRecord): PublicUserSummary {
    return {
        userId: user.userId,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        overallScore: user.alt.overallScore,
        overallLabel: user.alt.overallLabel,
        clusterId: user.alt.clusters[0] ?? null,
        isBanned: user.flags.isBanned,
        firstSeen: user.firstSeen,
    };
}

function toPublicDetail(user: UserRecord, store: InternalStore): PublicUserDetail {
    const ownerScores = resolveOwnerScores(user.alt.indicators);

    const suspectedOwners = Array.from(ownerScores.entries())
        .map(([ownerId, score]) => {
            const ownerUser = store.users.get(ownerId);
            return {
                userId: ownerId,
                username: ownerUser?.username ?? String(ownerId),
                confidence: capScore(score),
            };
        })
        .sort((a, b) => b.confidence - a.confidence);

    const relationships = Array.from(store.relationships.values())
        .filter(rel => rel.fromUserId === user.userId)
        .map(rel => {
            const toUser = store.users.get(rel.toUserId);
            return {
                toUserId: rel.toUserId,
                toUsername: toUser?.username ?? String(rel.toUserId),
                type: rel.type as IndicatorType,
                weight: rel.weight,
                totalValueMoved: rel.totalValueMoved,
            };
        });

    const indicatorsWithSummary = user.alt.indicators.map(ind => ({
        ...ind,
        summary: buildIndicatorSummary(ind),
    }));

    return {
        ...toPublicSummary(user),
        createdAt: user.createdAt,
        stats: user.stats,
        arcade: user.arcade,
        createdCoins: user.createdCoins,
        indicators: indicatorsWithSummary,
        relationships,
        suspectedOwners,
    };
}

function writeUsersIndex(
    users: UserRecord[],
    clusters: Map<string, ClusterRecord>,
    outDir: string
) {
    const sorted = [...users].sort((a, b) => b.alt.overallScore - a.alt.overallScore);
    const index: UsersIndex = {
        generatedAt: new Date().toISOString(),
        totalUsers: sorted.length,
        totalClusters: clusters.size,
        users: sorted.map(toPublicSummary),
    };
    writeJson(path.join(outDir, SNAPSHOT.usersIndexFile), index);
}

function writeUserFiles(users: UserRecord[], store: InternalStore, outDir: string) {
    const usersDir = path.join(outDir, SNAPSHOT.usersSubDir);
    ensureDir(usersDir);
    let written = 0;
    for (const user of users) {
        const detail = toPublicDetail(user, store);
        writeJson(path.join(usersDir, `${user.userId}.json`), detail);
        written++;
    }
}

function writeClusterFiles(
    clusters: Map<string, ClusterRecord>,
    store: InternalStore,
    outDir: string
) {
    const clustersDir = path.join(outDir, SNAPSHOT.clustersSubDir);
    ensureDir(clustersDir);
    let written = 0;
    for (const [, cluster] of clusters) {
        const members = cluster.memberUserIds
            .map(id => store.users.get(id))
            .filter((u): u is UserRecord => u !== undefined)
            .map(toPublicSummary);

        const detail: PublicClusterDetail = {
            ...cluster,
            members,
        };
        writeJson(path.join(clustersDir, `${cluster.clusterId}.json`), detail);
        written++;
    }
}

function cleanDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    for (const file of fs.readdirSync(dirPath)) {
        if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(dirPath, file));
        }
    }
}

export function buildSnapshot(store: InternalStore) {
    const outDir = path.resolve(__dirname, SNAPSHOT.outputDir);
    ensureDir(outDir);

    const usersDir = path.join(outDir, SNAPSHOT.usersSubDir);
    const clustersDir = path.join(outDir, SNAPSHOT.clustersSubDir);
    ensureDir(usersDir);
    ensureDir(clustersDir);

    cleanDir(usersDir);
    cleanDir(clustersDir);

    console.log(`Scoring ${store.users.size} users...`);

    const allUsers = Array.from(store.users.values());

    for (const [, user] of store.users) {
        const indicators = scoreUser(user, store, allUsers);
        user.alt.indicators = indicators;
        user.alt.overallScore = computeOverallScore(indicators);
        user.alt.overallLabel = resolveScoreLabel(user.alt.overallScore);
    }

    const referencedIds = new Set<number>();
    for (const [, user] of store.users) {
        for (const ind of user.alt.indicators) {
            if (ind.candidateMainUserId && !store.users.has(ind.candidateMainUserId)) {
                referencedIds.add(ind.candidateMainUserId);
            }
        }
    }
    if (referencedIds.size > 0) {
        console.log(`Creating ${referencedIds.size} stub profile(s) for referenced masterminds...`);
        for (const id of referencedIds) {
            const stub: UserRecord = {
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
            };
            store.users.set(id, stub);
        }
    }

    console.log('Building clusters...');
    const clusters = buildClusters(store);
    store.clusters = clusters;

    const users = Array.from(store.users.values());

    console.log('Writing snapshot files...');
    writeUsersIndex(users, clusters, outDir);
    writeUserFiles(users, store, outDir);
    writeClusterFiles(clusters, store, outDir);

    const flaggedCount = users.filter(u => u.alt.overallScore > 0).length;
    console.log(`Done. ${users.length} total users (${flaggedCount} flagged) across ${clusters.size} clusters.`);
}