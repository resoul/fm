import db from "../db";
import { Season } from "./Season";

export const CompetitionEnum = {
    leagua: 'leagua'
}

export class Competition{
    id!: number;
    name!: string;
    countryId!: number|null;
    type!: (typeof CompetitionEnum)[keyof typeof CompetitionEnum];

    async getActiveSeason (){
        return await db.oneOrError<Season>('season', { competitionId: this.id, isActive: 1 });
    }
}