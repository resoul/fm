export interface Player {
    id: string;
    name: string;
    position: string;
    role: string;
    duty: string;
    number: number;
    ability: number;
    condition: number;
    sharpness: number;
    morale: string;
    avgRating: string;
    status?: string;
    // Position ratings: maps position label -> 0-100
    positionRatings: Record<string, number>;
}

export const SQUAD_PLAYERS: Player[] = [
    {
        id: '1', name: 'Ederson', position: 'GK', role: 'SK', duty: 'Attack', number: 31,
        ability: 4, condition: 100, sharpness: 95, morale: 'Abysmal', avgRating: '-',
        positionRatings: { GK: 100, DC: 5 }
    },
    {
        id: '2', name: 'Kyle Walker', position: 'DR', role: 'WB', duty: 'Attack', number: 2,
        ability: 4, condition: 98, sharpness: 90, morale: 'Good', avgRating: '7.12',
        positionRatings: { DR: 100, WBR: 90, DC: 30, MC: 15 }
    },
    {
        id: '3', name: 'Rúben Dias', position: 'DCR', role: 'BPD', duty: 'Defend', number: 3,
        ability: 5, condition: 95, sharpness: 92, morale: 'Superb', avgRating: '7.45',
        positionRatings: { DC: 100, DR: 40, DL: 20, MC: 10 }
    },
    {
        id: '4', name: 'Aymeric Laporte', position: 'DCL', role: 'CD', duty: 'Defend', number: 14,
        ability: 4, condition: 97, sharpness: 88, morale: 'Very Good', avgRating: '7.20',
        positionRatings: { DC: 100, DL: 60, MC: 20 }
    },
    {
        id: '5', name: 'João Cancelo', position: 'DL', role: 'WB', duty: 'Attack', number: 7,
        ability: 4, condition: 94, sharpness: 91, morale: 'Good', avgRating: '7.35',
        positionRatings: { DL: 100, WBL: 90, DR: 70, WBR: 60, MC: 25 }
    },
    {
        id: '6', name: 'Rodri', position: 'MCR', role: 'BWM', duty: 'Defend', number: 16,
        ability: 5, condition: 96, sharpness: 93, morale: 'Superb', avgRating: '7.60',
        positionRatings: { MC: 100, DC: 40, DM: 80, AMC: 30 }
    },
    {
        id: '7', name: 'Kevin De Bruyne', position: 'MCL', role: 'BBM', duty: 'Support', number: 17,
        ability: 5, condition: 99, sharpness: 98, morale: 'Perfect', avgRating: '8.10',
        positionRatings: { MC: 100, AMC: 85, MR: 60, ML: 55, ST: 20 }
    },
    {
        id: '8', name: 'Bernardo Silva', position: 'AMR', role: 'IF', duty: 'Support', number: 20,
        ability: 4, condition: 93, sharpness: 90, morale: 'Very Good', avgRating: '7.55',
        positionRatings: { MR: 100, AMC: 80, MC: 75, ML: 50, ST: 30 }
    },
    {
        id: '9', name: 'Phil Foden', position: 'AMC', role: 'AM', duty: 'Attack', number: 47,
        ability: 5, condition: 95, sharpness: 94, morale: 'Superb', avgRating: '7.75',
        positionRatings: { AMC: 100, ML: 80, MR: 75, MC: 65, ST: 45 }
    },
    {
        id: '10', name: 'Jack Grealish', position: 'AML', role: 'IF', duty: 'Attack', number: 10,
        ability: 4, condition: 92, sharpness: 89, morale: 'Good', avgRating: '7.25',
        positionRatings: { ML: 100, AMC: 70, MC: 50, ST: 25 }
    },
    {
        id: '11', name: 'Erling Haaland', position: 'STC', role: 'AF', duty: 'Attack', number: 9,
        ability: 5, condition: 100, sharpness: 100, morale: 'Superb', avgRating: '8.50',
        positionRatings: { ST: 100, AMC: 40, MR: 10, ML: 10 }
    },
    {
        id: '12', name: 'Stefan Ortega', position: 'GK', role: 'SK', duty: 'Defend', number: 18,
        ability: 3, condition: 100, sharpness: 50, morale: 'Okay', avgRating: '-',
        positionRatings: { GK: 100 }
    },
    {
        id: '13', name: 'John Stones', position: 'DC', role: 'BPD', duty: 'Defend', number: 5,
        ability: 4, condition: 90, sharpness: 85, morale: 'Good', avgRating: '7.10',
        positionRatings: { DC: 100, MC: 50, DR: 30 }
    },
    {
        id: '14', name: 'Kalvin Phillips', position: 'DM', role: 'DM', duty: 'Support', number: 4,
        ability: 3, condition: 85, sharpness: 60, morale: 'Okay', avgRating: '6.80',
        positionRatings: { MC: 100, DC: 35, AMC: 20 }
    },
    {
        id: '15', name: 'Ilkay Gündogan', position: 'MC', role: 'DLP', duty: 'Support', number: 8,
        ability: 4, condition: 92, sharpness: 90, morale: 'Very Good', avgRating: '7.40',
        positionRatings: { MC: 100, AMC: 75, ML: 40, MR: 40 }
    },
    {
        id: '16', name: 'Julián Álvarez', position: 'ST', role: 'PF', duty: 'Attack', number: 19,
        ability: 4, condition: 95, sharpness: 92, morale: 'Superb', avgRating: '7.30',
        positionRatings: { ST: 100, AMC: 65, ML: 30, MR: 30 }
    },
    {
        id: '17', name: 'Manuel Akanji', position: 'DC', role: 'CD', duty: 'Defend', number: 25,
        ability: 4, condition: 96, sharpness: 88, morale: 'Good', avgRating: '7.15',
        positionRatings: { DC: 100, DR: 45, DL: 35, MC: 15 }
    },
];