import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { mergeLogs } from './merge-logs';
import { enrichStore } from './enrich';
import { buildSnapshot } from './build-snapshot';
import { loadStore, saveStore } from './store-persistence';
import { getBlacklistedIds } from './blacklist';
import type { InternalStore } from './types';

const args = process.argv.slice(2);
const useMock = args.includes('--mock');
const skipEnrich = args.includes('--skip-enrich');
const fullRebuild = args.includes('--full-rebuild');
const limitArgIndex = args.indexOf('--limit-enrichment');
const limitEnrichment = limitArgIndex !== -1 && args[limitArgIndex + 1] ? parseInt(args[limitArgIndex + 1], 10) : undefined;
const COOKIE = process.env.RUGPLAY_COOKIE ?? '';

function copySnapshotToFrontend() {
    const snapshotSrc = path.resolve(__dirname, '../../snapshot');
    const frontendDest = path.resolve(__dirname, '../../frontend/public/snapshot');

    if (!fs.existsSync(snapshotSrc)) {
        console.log('No snapshot/ directory found to copy.');
        return;
    }

    if (!fs.existsSync(path.resolve(__dirname, '../../frontend/public'))) {
        console.log('frontend/public/ not found — skipping auto-copy.');
        return;
    }

    if (fs.existsSync(frontendDest)) {
        fs.rmSync(frontendDest, { recursive: true, force: true });
    }

    fs.cpSync(snapshotSrc, frontendDest, { recursive: true });
    console.log(`Auto-copied snapshot/ → frontend/public/snapshot/`);
}

async function run() {
    console.log('--- The Rugplay Files CLI ---');
    console.log(`Mode: ${useMock ? 'mock' : 'live'}`);
    console.log(`Enrichment: ${skipEnrich ? 'skipped' : 'enabled'}`);
    console.log(`Store: ${fullRebuild ? 'full rebuild (ignoring store.json)' : 'persistent'}`);
    console.log('');

    let existingStore = undefined;
    if (!fullRebuild && !useMock) {
        existingStore = loadStore() ?? undefined;
    }

    const store = mergeLogs(useMock, existingStore);

    const blacklist = getBlacklistedIds();
    if (blacklist.size > 0) {
        console.log(`Applying blacklist: purging ${blacklist.size} user ID(s)...`);
        for (const id of blacklist) {
            store.users.delete(id);
        }
        for (const [key, rel] of store.relationships.entries()) {
            if (blacklist.has(rel.fromUserId) || blacklist.has(rel.toUserId)) {
                store.relationships.delete(key);
            }
        }
    }

    if (store.users.size === 0) {
        console.log('No data found. Drop exported log files into logs/ and try again.');
        return;
    }

    if (!skipEnrich) {
        if (!COOKIE) {
            console.log('No RUGPLAY_COOKIE found in .env — skipping enrichment.');
            console.log('Add RUGPLAY_COOKIE=your-cookie to cli/.env and try again.');
        } else {
            await enrichStore(store, COOKIE, limitEnrichment);
        }
    }

    buildSnapshot(store);

    if (!useMock) {
        saveStore(store);
    }

    copySnapshotToFrontend();

    console.log('');
    console.log('=== Pipeline Complete ===');
    console.log(`Users in database: ${store.users.size}`);
    console.log(`Coins tracked: ${store.coins.size}`);
    console.log(`Relationships: ${store.relationships.size}`);
    console.log(`Clusters: ${store.clusters.size}`);
}

run().catch(err => {
    console.error('CLI failed:', err);
    process.exit(1);
});