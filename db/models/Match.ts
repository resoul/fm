import db from "@/../db/db";
import type { Club } from "./Club";
import type { Round } from "./Round";
import Table from "@/../db/projections/Table";
import ManagerMatches from "@/../db/caches/ManagerMatches";

export const MatchStatusEnum = {
    created: 'created',
    scheduled: 'scheduled',
    playing: 'playing',
    ended: 'ended',
    postponed: 'postponed'
}

export class Match{
    id!: number;
    date!: string;
    homeClubId!: number;
    awayClubId!: number;
    roundId!: number;
    stageId!: number;
    status!: (typeof MatchStatusEnum)[keyof typeof MatchStatusEnum];
    homeGoals!: number;
    awayGoals!: number;

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

    static onUpdate(mods: any, primKey: number, obj: Match) {
        // console.log(obj, mods);
        Table.deleteCache(obj.stageId);
        ManagerMatches.deleteCache();
        return { updatedAt: Date.now() }; // Добавляем метку времени
    }

}