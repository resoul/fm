import db from "@/../db/db";
import type { Club } from "./Club";
import type { Round } from "./Round";
import Table from "@/../db/projections/Table";
import type { Stage } from "./Stage";
import { Season } from "./Season";

export const MatchStatusEnum = {
    created: 'created',
    scheduled: 'scheduled',
    playing: 'playing',
    ended: 'ended',
    postponed: 'postponed'
}

export const FinishMethodEnum = {
    regular: 'regular',
    overtime: 'overtime',
    penalties: 'penalties',
}

export class Match{
    id!: number;
    date!: string;
    homeClubId!: number;
    awayClubId!: number;
    roundId!: number;
    stageId!: number;
    seasonId!: number;
    dayIndex!: number;
    status!: (typeof MatchStatusEnum)[keyof typeof MatchStatusEnum];
    finishMethod!: (typeof FinishMethodEnum)[keyof typeof FinishMethodEnum];
    homeGoals!: number;
    awayGoals!: number;
    homePenalty!: number;
    awayPenalty!: number;

    getVenue(club: Club){
        if(club.id == this.homeClubId) {
            return 'H';
        } else {
            return 'A';
        }
    }

    async getRound(): Promise<Round>{
        return await db.oneOrError<Round>('round', this.roundId);
    }

    async getStage(): Promise<Stage>{
        return await db.oneOrError<Stage>('stage', this.stageId);
    }

    async getSeason(): Promise<Season>{
        return await db.oneOrError<Season>('season', this.seasonId);
    }

    static onUpdate(mods: any, primKey: number, obj: Match) {
        // console.log(obj, mods);
        Table.deleteCache(obj.stageId);
        return { updatedAt: Date.now() }; // Добавляем метку времени
    }

}