import DbError from "../errors/DbError";
import db from "../db";
import type { Competition } from "./Competition";
import type { Season } from "./Season";
import type { Club } from "./Club";
import type { Stage } from "./Stage";

export class Manager{
    id!: number;
    clubId!: number;
    name!: string;

    async getCompetition(type: string): Promise<Competition>{
        const competitions = await this.getCompetitions();
        const competition = competitions.find(c => c.type === type);
        if (!competition){
            throw new DbError(`No competition type ${type} found for manager ${this.id}`);
        }

        return competition;
    }

    async getCompetitions(): Promise<Competition[]>{
        const seasons = await this.getSeasons();
        return await db.table("competition").bulkGet(seasons.map(s => s.competitionId));
    }

    async getSeasons(): Promise<Season[]>{
        const clubSeasons = await db.table("seasonClub").where('clubId').equals(this.clubId).toArray();
        const seasonIds = clubSeasons.map(sc => sc.seasonId);
        return await db.table("season").bulkGet(seasonIds);
    }

    async getClub(): Promise<Club>{
        if (!this.clubId){
            throw new DbError('Manager have not club.');
        }
        return await db.table('club').get(this.clubId);
    }

    async getStages(): Promise<Stage[]>{
        const competitions = await this.getCompetitions();
        return await db.stage.where('competitionId').anyOf(competitions.map(c => c.id)).toArray();
    }
}