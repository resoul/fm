import db from "@/../db/db";
import type { Club } from "./Club";

export class SeasonClub{

    id!: number;
    seasonId!: number;
    clubId!: number;

    async getClub(){
        return await db.table<Club>('club').get(this.clubId);
    }

}