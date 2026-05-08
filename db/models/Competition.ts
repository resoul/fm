import Table from "../projections/Table";
import db from "../db";
import { Season } from "./Season";

export const CompetionEnum = {
    leagua: 'leagua'
}

export class Competion{
    id!: number;
    name!: string;
    countryId!: number|null;
    type!: (typeof CompetionEnum)[keyof typeof CompetionEnum];

    async getActiveSeason (){
        return await db.oneOrError<Season>('season', { competitionId: this.id, isActive: 1 });
    }

    async getTable(){
        return new Table(this, this.type);
    }
}