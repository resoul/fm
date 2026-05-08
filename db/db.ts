import OrmDb from './OrmDb';
import { Competion, Club, Season, Manager } from './models';
import { Match } from './models/Match';

const db = new OrmDb('FootballDatabase');

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

db.table('competition').mapToClass(Competion);
db.table('club').mapToClass(Club);
db.table('season').mapToClass(Season);
db.table('manager').mapToClass(Manager);
db.table('match').mapToClass(Match);

export default db;
