import fs from 'fs';
import path from 'path';

let cachedBlacklist: Set<number> | null = null;

export function getBlacklistedIds(): Set<number> {
    if (cachedBlacklist !== null) return cachedBlacklist;
    
    try {
        const blacklistPath = path.resolve(__dirname, '../../blacklist.json');
        if (!fs.existsSync(blacklistPath)) {
            cachedBlacklist = new Set<number>();
            return cachedBlacklist;
        }

        const data = JSON.parse(fs.readFileSync(blacklistPath, 'utf-8'));
        if (Array.isArray(data.blacklistedUserIds)) {
            cachedBlacklist = new Set(data.blacklistedUserIds.map((id: unknown) => Number(id)));
        } else {
            cachedBlacklist = new Set<number>();
        }
    } catch (error) {
        console.error('Failed to read blacklist.json:', error);
        cachedBlacklist = new Set<number>();
    }

    return cachedBlacklist;
}
