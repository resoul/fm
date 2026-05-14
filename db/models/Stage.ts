import db from "@/../db/db";
import type { Competition } from "./Competition";
import type { Season } from "./Season";
import Table from "@/../db/projections/Table";
import type { DayOfWeek } from "@/types/DayOfWeek";

export const StageEnum = {
    group: 'group',
    cup: 'cup',
}

export type TimeSlot = {
    day: DayOfWeek;
    hour: number;
    minute: number;
    prime_time: number;
}

export class Stage{

    id!: number;
    name!: string;
    competitionId!: number;
    stagePosition!: number;
    type!: (typeof StageEnum)[keyof typeof StageEnum];
    drawDate!: string;
    startDate!: string;
    circle: number = 1;
    timeSlots!: TimeSlot[];
    
    season: Season|null = null;

    async getCompetition(): Promise<Competition>{
        return await db.oneOrError('competition', this.competitionId);
    }

    async getSeason(): Promise<Season>{
        if (null != this.season){
            return this.season;
        }
        const competition = await this.getCompetition();
        this.season = await competition.getActiveSeason();
        return this.season;
    }

        
    async getTable(){
        return Table.getInstance(this);
    }
}