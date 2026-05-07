export interface GridPosition {
    id: string;
    label: string;          // e.g. "CF", "WB", "GK"
    x: number;              // % from left (0–100)
    y: number;              // % from top (0–100)
    defaultRole: string;    // e.g. "CF", "SK", "DM"
    defaultDuty: 'Attack' | 'Support' | 'Defend';
    naturalFor: string[];       // position codes — green highlight
    accomplishedFor: string[];  // position codes — orange highlight
}

export interface Formation {
    name: string;
    displayName: string;
    positions: GridPosition[];
}

// ── 4-2-3-1 DM AM Wide ─────────────────────────────────────────────────────
const F4231: Formation = {
    name: '4-2-3-1',
    displayName: '4-2-3-1 DM AM Wide',
    positions: [
        // Goalkeeper
        {
            id: 'GK', label: 'GK', x: 50, y: 93,
            defaultRole: 'SK', defaultDuty: 'Support',
            naturalFor: ['GK'], accomplishedFor: [],
        },
        // Back four
        {
            id: 'WB-L', label: 'WB', x: 9, y: 75,
            defaultRole: 'WB', defaultDuty: 'Support',
            naturalFor: ['DL', 'WBL'], accomplishedFor: ['DR', 'WBR', 'ML'],
        },
        {
            id: 'CD-L', label: 'CD', x: 39, y: 78,
            defaultRole: 'CD', defaultDuty: 'Defend',
            naturalFor: ['DC', 'DCL', 'DCR'], accomplishedFor: ['DL', 'DR', 'MC'],
        },
        {
            id: 'BPD-R', label: 'BPD', x: 61, y: 78,
            defaultRole: 'BPD', defaultDuty: 'Defend',
            naturalFor: ['DC', 'DCL', 'DCR'], accomplishedFor: ['DL', 'DR', 'MC'],
        },
        {
            id: 'WB-R', label: 'WB', x: 91, y: 75,
            defaultRole: 'WB', defaultDuty: 'Support',
            naturalFor: ['DR', 'WBR'], accomplishedFor: ['DL', 'WBL', 'MR'],
        },
        // DM double pivot
        {
            id: 'DM-L', label: 'DM', x: 35, y: 59,
            defaultRole: 'DM', defaultDuty: 'Support',
            naturalFor: ['DM', 'MCL', 'MC'], accomplishedFor: ['DC', 'AMC'],
        },
        {
            id: 'BWM-R', label: 'BWM', x: 65, y: 59,
            defaultRole: 'BWM', defaultDuty: 'Defend',
            naturalFor: ['MCR', 'MC', 'DM'], accomplishedFor: ['DC', 'AMC'],
        },
        // AM trio
        {
            id: 'IW-L', label: 'IW', x: 9, y: 33,
            defaultRole: 'IW', defaultDuty: 'Support',
            naturalFor: ['AML', 'ML', 'WBL'], accomplishedFor: ['AMC', 'MC', 'STC'],
        },
        {
            id: 'AP-C', label: 'AP', x: 50, y: 33,
            defaultRole: 'AP', defaultDuty: 'Support',
            naturalFor: ['AMC', 'MC'], accomplishedFor: ['AML', 'AMR', 'STC'],
        },
        {
            id: 'W-R', label: 'W', x: 91, y: 33,
            defaultRole: 'W', defaultDuty: 'Support',
            naturalFor: ['AMR', 'MR', 'WBR'], accomplishedFor: ['AMC', 'MC', 'STC'],
        },
        // Striker
        {
            id: 'CF', label: 'CF', x: 50, y: 12,
            defaultRole: 'CF', defaultDuty: 'Attack',
            naturalFor: ['STC', 'ST'], accomplishedFor: ['AMC', 'AML', 'AMR'],
        },
    ],
};

// ── 4-4-2 ────────────────────────────────────────────────────────────────────
const F442: Formation = {
    name: '4-4-2',
    displayName: '4-4-2',
    positions: [
        { id: 'GK',   label: 'GK', x: 50, y: 87, defaultRole: 'SK',  defaultDuty: 'Support', naturalFor: ['GK'], accomplishedFor: [] },
        { id: 'DL',   label: 'DL', x: 9,  y: 71, defaultRole: 'WB',  defaultDuty: 'Support', naturalFor: ['DL','WBL'], accomplishedFor: ['DR','WBR','ML'] },
        { id: 'DC-L', label: 'DC', x: 32, y: 71, defaultRole: 'CD',  defaultDuty: 'Defend',  naturalFor: ['DC','DCL','DCR'], accomplishedFor: ['DL','DR'] },
        { id: 'DC-R', label: 'DC', x: 68, y: 71, defaultRole: 'CD',  defaultDuty: 'Defend',  naturalFor: ['DC','DCL','DCR'], accomplishedFor: ['DL','DR'] },
        { id: 'DR',   label: 'DR', x: 91, y: 71, defaultRole: 'WB',  defaultDuty: 'Support', naturalFor: ['DR','WBR'], accomplishedFor: ['DL','WBL','MR'] },
        { id: 'ML',   label: 'ML', x: 9,  y: 47, defaultRole: 'W',   defaultDuty: 'Support', naturalFor: ['ML','AML'], accomplishedFor: ['MC','AMC'] },
        { id: 'MC-L', label: 'MC', x: 34, y: 47, defaultRole: 'CM',  defaultDuty: 'Support', naturalFor: ['MC','MCL','MCR'], accomplishedFor: ['DM','AMC'] },
        { id: 'MC-R', label: 'MC', x: 66, y: 47, defaultRole: 'CM',  defaultDuty: 'Support', naturalFor: ['MC','MCL','MCR'], accomplishedFor: ['DM','AMC'] },
        { id: 'MR',   label: 'MR', x: 91, y: 47, defaultRole: 'W',   defaultDuty: 'Support', naturalFor: ['MR','AMR'], accomplishedFor: ['MC','AMC'] },
        { id: 'ST-L', label: 'ST', x: 35, y: 15, defaultRole: 'AF',  defaultDuty: 'Attack',  naturalFor: ['STC','ST'], accomplishedFor: ['AMC','AML','AMR'] },
        { id: 'ST-R', label: 'ST', x: 65, y: 15, defaultRole: 'AF',  defaultDuty: 'Attack',  naturalFor: ['STC','ST'], accomplishedFor: ['AMC','AML','AMR'] },
    ],
};

// ── 3-5-2 ────────────────────────────────────────────────────────────────────
const F352: Formation = {
    name: '3-5-2',
    displayName: '3-5-2',
    positions: [
        { id: 'GK',   label: 'GK',  x: 50, y: 87, defaultRole: 'SK',  defaultDuty: 'Support', naturalFor: ['GK'], accomplishedFor: [] },
        { id: 'DC-L', label: 'DC',  x: 24, y: 72, defaultRole: 'CD',  defaultDuty: 'Defend',  naturalFor: ['DC','DCL','DCR'], accomplishedFor: ['DL','DR'] },
        { id: 'DC-C', label: 'DC',  x: 50, y: 72, defaultRole: 'BPD', defaultDuty: 'Defend',  naturalFor: ['DC','DCL','DCR'], accomplishedFor: ['DL','DR'] },
        { id: 'DC-R', label: 'DC',  x: 76, y: 72, defaultRole: 'CD',  defaultDuty: 'Defend',  naturalFor: ['DC','DCL','DCR'], accomplishedFor: ['DL','DR'] },
        { id: 'WBL',  label: 'WBL', x: 7,  y: 52, defaultRole: 'WB',  defaultDuty: 'Support', naturalFor: ['DL','WBL'], accomplishedFor: ['ML','AML'] },
        { id: 'MC-L', label: 'MC',  x: 30, y: 50, defaultRole: 'CM',  defaultDuty: 'Support', naturalFor: ['MC','MCL'], accomplishedFor: ['DM','AMC'] },
        { id: 'DM',   label: 'DM',  x: 50, y: 55, defaultRole: 'DM',  defaultDuty: 'Defend',  naturalFor: ['DM','MC'], accomplishedFor: ['DC','AMC'] },
        { id: 'MC-R', label: 'MC',  x: 70, y: 50, defaultRole: 'CM',  defaultDuty: 'Support', naturalFor: ['MC','MCR'], accomplishedFor: ['DM','AMC'] },
        { id: 'WBR',  label: 'WBR', x: 93, y: 52, defaultRole: 'WB',  defaultDuty: 'Support', naturalFor: ['DR','WBR'], accomplishedFor: ['MR','AMR'] },
        { id: 'ST-L', label: 'ST',  x: 35, y: 15, defaultRole: 'AF',  defaultDuty: 'Attack',  naturalFor: ['STC','ST'], accomplishedFor: ['AMC'] },
        { id: 'ST-R', label: 'ST',  x: 65, y: 15, defaultRole: 'AF',  defaultDuty: 'Attack',  naturalFor: ['STC','ST'], accomplishedFor: ['AMC'] },
    ],
};

export const FORMATIONS: Record<string, Formation> = {
    '4-2-3-1': F4231,
    '4-4-2':   F442,
    '3-5-2':   F352,
};

export const DEFAULT_FORMATION = '4-2-3-1';

// Legacy compat
export const FIELD_ROWS = 6;
export const FIELD_COLS = 5;
export const getGridIndex = (row: number, col: number) => row * FIELD_COLS + col;