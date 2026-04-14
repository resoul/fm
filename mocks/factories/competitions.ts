import { db } from '../db';

export const europeancompetitionsData = [
    { name: 'Premier League', country: 'England' },
    { name: 'La Liga', country: 'Spain' },
    { name: 'Bundesliga', country: 'Germany' },
    { name: 'Serie A', country: 'Italy' },
    { name: 'Ligue 1', country: 'France' },
    { name: 'Primeira Liga', country: 'Portugal' },
    { name: 'Eredivisie', country: 'Netherlands' },
    { name: 'Scottish Premiership', country: 'Scotland' },
    { name: 'Belgian Pro League', country: 'Belgium' },
    { name: 'Süper Lig', country: 'Turkey' },
    { name: 'Swiss Super League', country: 'Switzerland' },
    { name: 'Austrian Bundesliga', country: 'Austria' },
    { name: 'Super League Greece', country: 'Greece' },
    { name: 'Danish Superliga', country: 'Denmark' },
    { name: 'Ekstraklasa', country: 'Poland' },
    { name: 'Allsvenskan', country: 'Sweden' },
    { name: 'Eliteserien', country: 'Norway' },
    { name: 'Czech First League', country: 'Czech Republic' },
    { name: 'Serbian SuperLiga', country: 'Serbia' },
    { name: 'Liga I', country: 'Romania' },
    { name: 'Ukrainian Premier League', country: 'Ukraine' },
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
            // clubs: []
        });
    }
);
