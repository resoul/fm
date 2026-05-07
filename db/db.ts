 import Dexie from 'dexie';

const db = new Dexie('FootballDatabase');

db.version(2).stores({
    currentDate: 'date', //todo
    manager: '++id, name, clubId',
    person: '++id, name, role, clubId, position',
    continent: '++id, name',
    country: '++id, name, continentId',
    competition: '++id, name, countryId', //type
    draw: '++id, name, seasonId, date',
    season: '++id, name, competitionId, isActive, [competitionId+isActive]', //startDate, endDate',
    club: '++id, name, countryId',
    seasonClub: '++id, seasonId, clubId, [seasonId+clubId]',
    round: '++id, name, seasonId',
    match: '++id, date, homeClubId, awayClubId, roundId', //homeGoals, awayGoals, status
});

export default db;
