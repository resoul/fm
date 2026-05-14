import db from "@/../db/db";
import type { Season } from "./Season";
import type { Match } from "./Match";
import type { Stage } from "./Stage";

export class Round{

    id!: number;
    name!: string;
    stageId!: number;
    seasonId!: number;
    startDate!: string;
    drawDate!: string|null;


    async getSeason(): Promise<Season>{
        return await db.oneOrError<Season>('season', this.seasonId);
    }

    async getMatches(): Promise<Match[]>{
        return db.match.where('roundId').equals(this.id).toArray();
    }

    async getStage(): Promise<Stage>{
        return db.oneOrError<Stage>('stage', this.stageId);
    }
}