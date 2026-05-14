import db from "@/../db/db"
import { MatchStatusEnum, Season, Stage } from "@/../db/models";
import { Club } from "../models/Club";
import DbError from "@/../db/errors/DbError";

export default class Table {
    
    stage: Stage;
    clubs: TableClub[] = [];
    static tables: Map<number, Promise<Table>> = new Map<number, Promise<Table>>();

    static async getInstance(stage: Stage): Promise<Table>{
        let tablePromise = this.tables.get(stage.id);
        
        if (!tablePromise) {
            const createTable = async (): Promise<Table> => {
                const table = new Table(stage);
                await table.initTable();
                return table;
            };

            tablePromise = createTable();
            this.tables.set(stage.id, tablePromise);
        }

        return tablePromise;
    }

    static deleteCache(stageId: number){
        console.log('delete cache' + stageId);
        this.tables.delete(stageId);
    }

    constructor(stage: Stage){
        this.stage = stage;
    }

    getTable(sort: Exclude<keyof TableClub, "club"> = 'points'): TableClub[]{
        let table = this.clubs;
        if (sort == 'points'){
            table.sort((a, b) => {
                if (b.points !== a.points) {
                    return b.points - a.points;
                }
                return b.goalDifference - a.goalDifference;
            });
        } else {
            table.sort((a, b) => {
                return b[sort] - a[sort];
            });
        }

        return table;
    }

    sortByPosition(): TableClub[]{
        let table = this.clubs;
        table.sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points;
            }
            return b.goalDifference - a.goalDifference;
        });

        return table;
    }

    getTableClub(clubId: number): TableClub{
        const club = this.clubs.find(c => c.club.id == clubId);
        if (club == undefined){
            throw new DbError(`Club with id=${clubId} not found`);
        }
        return club;
    } 

    async initTable(): Promise<TableClub[]>{
        
        if (this.clubs.length > 0){
            return this.clubs;
        }

        const season = await this.stage.getSeason();
        const seasonClubs = await db.table('seasonClub').where('seasonId').equals(season.id).toArray(); //TODO don`t need

        const allMatches = await db.table('match')
            .where('stageId')
            .anyOf(this.stage.id)
            .filter(m => m.status === MatchStatusEnum.ended)
            .toArray();

        for (const sClub of seasonClubs) {
            const club = await db.oneOrError<Club>('club', sClub.clubId);
            const row = new TableClub(club);
            const clubMatches = allMatches.filter(
                m => m.homeClubId === club.id || m.awayClubId === club.id
            );

            clubMatches.forEach(match => {
                const isHome = match.homeClubId === club.id;
                const homeG = match.homeGoals || 0;
                const awayG = match.awayGoals || 0;
                const diff = homeG - awayG;

                row.played++;
                if (diff === 0) {
                    row.draws++;
                    row.points += 1;
                } else if ((isHome && diff > 0) || (!isHome && diff < 0)) {
                    row.wins++;
                    row.points += 3;
                } else {
                    row.losses++;
                }

                row.scoredGoals += isHome ? homeG : awayG;
                row.missedGoals += isHome ? awayG : homeG;
            });

            row.goalDifference = row.scoredGoals - row.missedGoals;
            this.clubs.push(row);
        }

        this.sortByPosition().forEach((tc, index) => {
            const club = this.clubs.find(c => c.club.id === tc.club.id);
            if (club) club.position = index + 1;
        });

        return this.clubs;
    }
}

export class TableClub{
    club: Club;
    points: number;
    missedGoals: number;
    scoredGoals: number;
    goalDifference: number;
    played: number;
    losses: number;
    wins: number;
    draws: number;
    position: number;

    constructor(club: Club){
        this.club = club;
        this.points = 0;
        this.missedGoals = 0;
        this.scoredGoals = 0;
        this.goalDifference = 0;
        this.played = 0;
        this.losses = 0;
        this.wins = 0;
        this.draws = 0;
        this.position = 0;
    }

}