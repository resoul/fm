import db from "@/../db/db";
import DrawEvent from "@/game_events/DrawEvent";
import MatcheEvent from "@/game_events/MatcheEvent";
import ScheduleEvent from "@/game_events/ScheduleEvent";
import { clearEvents, isHaveEvent } from "@/state/useEventStates";

export class CurrentDate{
    
    static readonly ID: number = 1; //only 1 row posible
    static readonly tableName = 'currentDate';
    static i = 0;
    static readonly MAX_STEP = 24 * 7; //week
    static readonly STEP_FREEZ = 1;
    id!: number;
    date!: string;

    static async getDateTime(): Promise<CurrentDate>{
        return await db.table('currentDate').get(CurrentDate.ID);
    }

    static async getDate(){
        const date = await this.getDateTime();
        return new Date(date.date);
    }

    getLocaleTime(){
        return new Date(this.date).toTimeString().slice(0, 5);
    }

    getLocaleDate(){
        return new Date(this.date).toLocaleDateString();
    }

    sleep(){
       return new Promise(resolve => setTimeout(resolve, 0));
    }

    async continue(){
        const nextDate = new Date(this.date);
        nextDate.setHours(nextDate.getHours() + 1 - new Date().getTimezoneOffset()/60); //1 hour + gvt
        await db.transaction('rw', [db.currentDate, db.stage, db.competition, db.round, db.match], async () =>
            await db.table(CurrentDate.tableName).update(this.id, {date: nextDate.toISOString().slice(0, 19)}));

        this.date = nextDate.toISOString().slice(0, 19);
        if (!isHaveEvent() && CurrentDate.i < CurrentDate.MAX_STEP){
            // console.log(isHaveEvent());
        // if (CurrentDate.i < 1000){
            ++CurrentDate.i;
            // if (CurrentDate.i % CurrentDate.STEP_FREEZ == 0)
                await this.sleep();
            await this.continue();
        } else {
            CurrentDate.i = 0;
            clearEvents();
        }
    }

    static async onUpdate(mods: any, primKey: number, obj: CurrentDate) {
        // console.log(obj, mods);
        await Promise.all([
            await new DrawEvent().dispatch(mods.date),
            await new MatcheEvent().dispatch(mods.date),
            await new ScheduleEvent().dispatch(mods.date),
        ])
    }

}