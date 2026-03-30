import type { UsersIndex, PublicUserDetail, PublicClusterDetail } from '../types';

const BASE_PATH = './snapshot';

export async function fetchUsersIndex(): Promise<UsersIndex> {
    console.log('Fetching users index from:', BASE_PATH + '/users-index.json');
    const response = await fetch(`${BASE_PATH}/users-index.json`);
    if (!response.ok) {
        console.error('Failed to fetch users index:', response.status, response.statusText);
        throw new Error(`Failed to load users index: ${response.status}`);
    }
    return response.json();
}

export async function fetchUserDetail(userId: number): Promise<PublicUserDetail> {
    console.log('Fetching user detail:', BASE_PATH + '/users/' + userId + '.json');
    const response = await fetch(`${BASE_PATH}/users/${userId}.json`);
    if (!response.ok) {
        console.error('Failed to fetch user:', response.status, response.statusText);
        throw new Error(`Failed to load user ${userId}`);
    }
    return response.json();
}

export async function fetchClusterDetail(clusterId: string): Promise<PublicClusterDetail> {
    console.log('Fetching cluster detail:', BASE_PATH + '/clusters/' + clusterId + '.json');
    const response = await fetch(`${BASE_PATH}/clusters/${clusterId}.json`);
    if (!response.ok) {
        console.error('Failed to fetch cluster:', response.status, response.statusText);
        throw new Error(`Failed to load cluster ${clusterId}`);
    }
    return response.json();
}

export function formatNumber(num: number): string {
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2) + 'M';
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(1) + 'K';
    }
    return num.toString();
}

export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

export function getScoreColor(label: string): string {
    switch (label) {
        case 'Very Likely': return '#dc2626';
        case 'Likely': return '#ea580c';
        case 'Possible': return '#ca8a04';
        case 'Unlikely': return '#16a34a';
        default: return '#6b7280';
    }
}