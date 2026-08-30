// Static 17-slot ghost grid — always present on pitch
// Layout: 1 GK + 5 DEF + 5 MID + 3 AM + 3 FWD

export interface GhostSlot {
    id: string;
    x: number;      // % from left
    y: number;      // % from top
    row: 'gk' | 'def' | 'mid' | 'am' | 'fwd';
    isGK: boolean;
    posLabel: string; // position code used to look up positionRatings
}

export const GHOST_SLOTS: GhostSlot[] = [
    // GK (1)
    { id: 'g-gk', x: 50, y: 91, row: 'gk',  isGK: true,  posLabel: 'GK' },

    // DEF (5) — outer slots are fullbacks, inner are centre-backs
    { id: 'g-d1', x: 9,  y: 75, row: 'def', isGK: false, posLabel: 'DL'  },
    { id: 'g-d2', x: 28, y: 75, row: 'def', isGK: false, posLabel: 'DC'  },
    { id: 'g-d3', x: 50, y: 75, row: 'def', isGK: false, posLabel: 'DC'  },
    { id: 'g-d4', x: 72, y: 75, row: 'def', isGK: false, posLabel: 'DC'  },
    { id: 'g-d5', x: 91, y: 75, row: 'def', isGK: false, posLabel: 'DR'  },

    // MID (5)
    { id: 'g-m1', x: 9,  y: 55, row: 'mid', isGK: false, posLabel: 'ML'  },
    { id: 'g-m2', x: 28, y: 55, row: 'mid', isGK: false, posLabel: 'MC'  },
    { id: 'g-m3', x: 50, y: 55, row: 'mid', isGK: false, posLabel: 'DM'  },
    { id: 'g-m4', x: 72, y: 55, row: 'mid', isGK: false, posLabel: 'MC'  },
    { id: 'g-m5', x: 91, y: 55, row: 'mid', isGK: false, posLabel: 'MR'  },

    // AM (3)
    { id: 'g-a1', x: 22, y: 36, row: 'am',  isGK: false, posLabel: 'AML' },
    { id: 'g-a2', x: 50, y: 36, row: 'am',  isGK: false, posLabel: 'AMC' },
    { id: 'g-a3', x: 78, y: 36, row: 'am',  isGK: false, posLabel: 'AMR' },

    // FWD (3)
    { id: 'g-f1', x: 22, y: 14, row: 'fwd', isGK: false, posLabel: 'ST'  },
    { id: 'g-f2', x: 50, y: 14, row: 'fwd', isGK: false, posLabel: 'ST'  },
    { id: 'g-f3', x: 78, y: 14, row: 'fwd', isGK: false, posLabel: 'ST'  },
];

// Snap radius in % units (pitch is 0–100 in both axes)
export const SNAP_RADIUS = 10;

export function findNearestSlot(x: number, y: number): GhostSlot | null {
    let best: GhostSlot | null = null;
    let bestDist = SNAP_RADIUS;
    for (const slot of GHOST_SLOTS) {
        const dx = slot.x - x;
        const dy = slot.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) { bestDist = dist; best = slot; }
    }
    return best;
}

/**
 * Given a player's positionRatings and a ghost slot's posLabel,
 * returns a 0–100 compatibility score.
 * Checks exact match first, then prefix matches.
 */
export function getSlotRating(
    positionRatings: Record<string, number>,
    posLabel: string,
): number {
    // Exact match
    if (posLabel in positionRatings) return positionRatings[posLabel];

    // Check if any rating key starts with posLabel or vice versa
    let best = 0;
    for (const [key, val] of Object.entries(positionRatings)) {
        if (key.startsWith(posLabel) || posLabel.startsWith(key)) {
            best = Math.max(best, val);
        }
    }
    return best;
}

/**
 * Converts a 0–100 rating to a CSS colour string.
 * 100 → green (#2ecc71), 50 → yellow (#f5a623), 0 → red (#e74c3c)
 */
export function ratingToColor(rating: number): string {
    const r = Math.max(0, Math.min(100, rating));
    if (r >= 50) {
        // green ↔ yellow  (r goes 50→100)
        const t = (r - 50) / 50; // 0 at 50%, 1 at 100%
        const red   = Math.round(245 + t * (46  - 245));  // 245→46
        const green = Math.round(166 + t * (204 - 166));  // 166→204
        const blue  = Math.round(35  + t * (113 - 35));   // 35→113
        return `rgb(${red},${green},${blue})`;
    } else {
        // red ↔ yellow  (r goes 0→50)
        const t = r / 50; // 0 at 0%, 1 at 50%
        const red   = Math.round(231 + t * (245 - 231));  // 231→245
        const green = Math.round(76  + t * (166 - 76));   // 76→166
        const blue  = Math.round(60  + t * (35  - 60));   // 60→35
        return `rgb(${red},${green},${blue})`;
    }
}