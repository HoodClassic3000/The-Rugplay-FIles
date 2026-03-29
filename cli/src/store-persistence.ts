import fs from 'fs';
import path from 'path';
import type {
    InternalStore,
    UserRecord,
    CoinRecord,
    RelationshipRecord,
    ClusterRecord,
} from './types';

const STORE_FILE = path.resolve(__dirname, '../../store.json');

interface SerializedStore {
    version: number;
    savedAt: string;
    users: [number, UserRecord][];
    coins: [string, CoinRecord][];
    relationships: [string, RelationshipRecord][];
    clusters: [string, ClusterRecord][];
}

export function loadStore(): InternalStore | null {
    if (!fs.existsSync(STORE_FILE)) return null;

    try {
        const raw: SerializedStore = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        if (!raw.version || !raw.users) return null;

        const store: InternalStore = {
            users: new Map(raw.users),
            coins: new Map(raw.coins),
            relationships: new Map(raw.relationships),
            clusters: new Map(raw.clusters || []),
        };

        console.log(`Loaded persistent store (${store.users.size} users, ${store.coins.size} coins, saved ${raw.savedAt})`);
        return store;
    } catch (err) {
        console.warn(`Failed to load store.json, starting fresh:`, err);
        return null;
    }
}

export function saveStore(store: InternalStore): void {
    const serialized: SerializedStore = {
        version: 1,
        savedAt: new Date().toISOString(),
        users: Array.from(store.users.entries()),
        coins: Array.from(store.coins.entries()),
        relationships: Array.from(store.relationships.entries()),
        clusters: Array.from(store.clusters.entries()),
    };

    fs.writeFileSync(STORE_FILE, JSON.stringify(serialized));
    const sizeMb = (fs.statSync(STORE_FILE).size / (1024 * 1024)).toFixed(2);
    console.log(`Saved persistent store (${store.users.size} users, ${store.coins.size} coins, ${sizeMb} MB)`);
}
