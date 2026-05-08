import DbError from "../errors/DbError";
import db from "../db";
import type { Competion } from "./Competition";

export class Manager{
    id!: number;
    clubId!: number;
    name!: string;

    async getCompetion(type: string): Promise<Competion>{
        const competitions = await this.getCompetions();
        const competition = competitions.find(c => c.type === type);
        if (!competition){
            throw new DbError(`No competition type ${type} found for manager ${this.id}`);
        }

        return competition;
    }

    async getCompetions(): Promise<Competion[]>{
        const seasonClubs = await db.table("seasonClub").where('clubId').equals(this.clubId).toArray();
        const seasonIds = seasonClubs.map(sc => sc.seasonId);
        const seasons = await db.table("season").bulkGet(seasonIds);

        return await db.table("competition").bulkGet(seasons.map(s => s.competitionId));
    }

    async getClub(){
        if (!this.clubId){
            return null;
        }
        return await db.table('club').get(this.clubId);
    }
}