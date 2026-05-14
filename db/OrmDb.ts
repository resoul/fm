import Dexie, { type Table } from 'dexie';
import DbError from './errors/DbError';
import { Competition, Club, Season, Manager, Match, Stage, SeasonClub, Round, CurrentDate } from './models';

export default class OrmDb extends Dexie{

    competition!: Table<Competition, number>
    club!: Table<Club, number>
    season!: Table<Season, number>
    manager!: Table<Manager, number>
    match!: Table<Match, number>
    stage!: Table<Stage, number>
    seasonClub!: Table<SeasonClub, number>
    round!: Table<Round, number>
    currentDate!: Table<CurrentDate, number>

    constructor(databaseName: string){
        super(databaseName);
        this.version(1).stores({
            currentDate: '++id, date', //todo
            manager: '++id, name, clubId',
            person: '++id, name, role, clubId, position',
            continent: '++id, name',
            country: '++id, name, continentId',
            competition: '++id, name, countryId', //type
            draw: '++id, name, seasonId, date',
            season: '++id, name, competitionId, isActive, [competitionId+isActive]', //startDate, endDate',
            club: '++id, name, countryId',
            seasonClub: '++id, seasonId, clubId, [seasonId+clubId]',
            round: '++id, name, seasonId, stageId, startDate, drawDate',
            match: '++id, date, homeClubId, awayClubId, roundId, stageId', //homeGoals, awayGoals, status
            stage: '++id, drawDate, competitionId',
        });

        this.competition.mapToClass(Competition);
        this.club.mapToClass(Club);
        this.season.mapToClass(Season);
        this.manager.mapToClass(Manager);
        this.match.mapToClass(Match);
        (this.match as any).hook('updating', (mods: any, primKey: number, obj: Match) => Match.onUpdate(mods, primKey, obj));
        this.stage.mapToClass(Stage);
        this.seasonClub.mapToClass(SeasonClub);
        this.round.mapToClass(Round);
        this.currentDate.mapToClass(CurrentDate);
        (this.currentDate as any).hook('updating', (mods: any, primKey: number, obj: CurrentDate) => CurrentDate.onUpdate(mods, primKey, obj));
    }

    async oneOrError<T>(tableName: string, param: any): Promise<T> {

        if (typeof param === 'object' && param !== null && !Array.isArray(param)) {
            const row = await (this.table(tableName).where(param) as any).first(); //first not exist in typescript
            if (!row){
                const str = JSON.stringify(param);
                throw new DbError(`Row with params ${str} not found in ${tableName}`);
            }

            return row;
        }

        const id = Number(param);
        
        if (isNaN(id)){
            throw new DbError(`id = ${id} is not number`);
        }

        const row = await this.table(tableName).get(id);
        if (!row){
            throw new DbError(`Row ${id} not found in ${tableName}`);
        }

        return row;
    }
}