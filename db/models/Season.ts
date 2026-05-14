import db from "@/../db/db";
import type { SeasonClub } from "./SeasonClub";
import type { Club } from "./Club";
import type { Competition } from "./Competition";

export class Season{

    id!: number;
    name!: string;
    competitionId!: number;

    async getClubs(): Promise<Club[]>{
        const seasonClubs = await db.table<SeasonClub>('seasonClub').where('seasonId').equals(this.id).toArray();
        const clubs = await Promise.all(seasonClubs.map(async s => s.getClub()));
        return clubs.filter(c => !!c);
    }

    async getCompetion(): Promise<Competition>{
        return await db.oneOrError('competition', this.competitionId);
    }

}