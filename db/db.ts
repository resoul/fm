 import Dexie from 'dexie';

const db = new Dexie('FootballDatabase');

db.version(1).stores({
    manager: '++id, name, clubId',
    continent: '++id, name',
    country: '++id, name, continentId',
    competition: '++id, name, countryId, season',
    draw: '++id, name, seasonId, date',
    season: '++id, name, competitionId', //startDate, endDate',
    club: '++id, name, countryId',
    seasonClub: '++id, seasonId, teamId, [seasonId+teamId]',
    round: '++id, name, seasonId',
    match: '++id, date, homeClubId, awayClubId, roundId', //homeGoals, awayGoals,
});

export default db;