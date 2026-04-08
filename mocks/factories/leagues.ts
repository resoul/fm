import { db } from '../db';

export const europeanLeaguesData = [
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

export const leaguesCreate = () => europeanLeaguesData.map((league) => db.league.create(league));
