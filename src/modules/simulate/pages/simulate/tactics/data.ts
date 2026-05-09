import type { PlayerProfile, PlayerPosition } from '../engine/types';

export interface Player {
    id: string;
    name: string;
    position: string; // Map from primaryPosition
    role: string;     // Map from role
    duty: string;     // Defaulting for now
    number: number;
    ability: number;  // Map from overallRating
    condition: number; // Map from fitness
    sharpness: number; // Map from form
    morale: string;   // Defaulting
    avgRating: string;
    status?: string;
    positionRatings: Record<string, number>; // Derived from alternatePositions
}

// Helper to convert PlayerProfile to Tactics Player
export function profileToPlayer(profile: PlayerProfile): Player {
    const posRatings: Record<string, number> = {
        [profile.primaryPosition]: 100
    };
    profile.alternatePositions.forEach(p => {
        posRatings[p] = 80; // Simplification
    });

    return {
        id: profile.id,
        name: profile.name,
        position: profile.primaryPosition,
        role: profile.role,
        duty: 'Support', // Default
        number: profile.number,
        ability: 0, // Should be calculated
        condition: profile.fitness,
        sharpness: profile.form,
        morale: 'Good',
        avgRating: '-',
        positionRatings: posRatings,
    };
}
