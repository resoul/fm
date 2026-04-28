import { db } from '../db';
import { CompetitionSchema } from '@/schemas/competition';

export const europeancompetitionsData = [
    { name: 'Premier League', country: 'England', type: 'league' },
    { name: 'La Liga', country: 'Spain', type: 'league' },
    { name: 'Bundesliga', country: 'Germany', type: 'league' },
    { name: 'Seria A', country: 'Italy', type: 'league' },
    { name: 'Ligue 1', country: 'France', type: 'league' },
    { name: 'Primeira Liga', country: 'Portugal', type: 'league' },
    { name: 'Eredivisie', country: 'Netherlands', type: 'league' },
    { name: 'Scottish Premiership', country: 'Scotland', type: 'league' },
    { name: 'Belgian Pro League', country: 'Belgium', type: 'league' },
    { name: 'Süper Lig', country: 'Turkey', type: 'league' },
    { name: 'Swiss Super League', country: 'Switzerland', type: 'league' },
    { name: 'Austrian Bundesliga', country: 'Austria', type: 'league' },
    { name: 'Super League Greece', country: 'Greece', type: 'league' },
    { name: 'Danish Superliga', country: 'Denmark', type: 'league' },
    { name: 'Ekstraklasa', country: 'Poland', type: 'league' },
    { name: 'Allsvenskan', country: 'Sweden', type: 'league' },
    { name: 'Eliteserien', country: 'Norway', type: 'league' },
    { name: 'Czech First League', country: 'Czech Republic', type: 'league' },
    { name: 'Serbian SuperLiga', country: 'Serbia', type: 'league' },
    { name: 'Liga I', country: 'Romania', type: 'league' },
    { name: 'Ukrainian Premier League', country: 'Ukraine', type: 'league' },
];

let competitionId = 1;

export const competitionsCreate = async () => europeancompetitionsData.map(
    
    async (competition) => {
        const country = db.country.findFirst(c => c.where({name: competition.country}));

        if (!country) {
            throw new Error(`Country not found for competition ${competition.name}`);
        }
        await db.competition.create({
            ...competition, 
            id: competitionId++, 
            countryId: country.id, 
            continentId: country.continentId,
            type: CompetitionSchema.shape.type.parse(competition.type),
        });
    }
);
