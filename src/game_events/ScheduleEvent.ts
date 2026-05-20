import db from "@/../db/db";
import type { IEvent } from "./IEvent";
import { CompetitionEnum, type Match, type Round, type Stage } from "@/../db/models";
import Table from "@/../db/projections/Table";
import type { TimeSlot } from "@/../db/models";
import { getIndexDay } from "@/types/DayOfWeek";
import dayIndexDate from "@/lib/date/dayIndexDate";

export default class ScheduleEvent implements IEvent {

    async dispatch(dateTime: string): Promise<void> {
        const rounds = await db.round.where('drawDate').between(0, dateTime, false, true).toArray();
        for(const round of rounds){
            this.scheduleRound(round);
            db.round.update(round.id, {drawDate: null});
        }
    }

    async scheduleRound(round: Round){
        let matches = await round.getMatches();
        const stage = await round.getStage();

        const genSlot = this.getSlot(stage.timeSlots);
        const competition = await stage.getCompetition();
        
        if (competition.type == CompetitionEnum.leagua){
            matches = await this.sortLegueMatches(matches, stage);
        }
        
        const m = matches.map(match => {
            const gSlot = genSlot.next();
            const startDate = new Date(round.startDate);
            // console.log(gSlot.value);
            if (!gSlot.value?.day){
                throw new Error('Round slot have not a day');
            }
            let diff = getIndexDay(gSlot.value.day) - startDate.getDay();
            if (diff >= 4) {
                diff -= 7;
            } else if (diff < -3) {
                diff += 7;
            }
            
            const newDate = new Date(startDate);
            newDate.setDate(startDate.getDate() + diff);

            const isoDate = newDate.toISOString().slice(0, 10);
            const hour = gSlot.value.hour > 9 ? gSlot.value.hour : '0' + gSlot.value.hour;
            const minute = gSlot.value.minute > 9 ? gSlot.value.minute : '0' + gSlot.value.minute;
            match.date = `${isoDate}T${hour}:${minute}:00`;
            match.dayIndex = dayIndexDate(newDate);

            return {key: match.id, changes: match}
        });
        // console.log(m);
        await db.match.bulkUpdate(m);
    }

    async sortLegueMatches(matches: Match[], stage: Stage): Promise<Match[]>{
        const table = await Table.getInstance(stage);
        const rankMatches = matches.map(match => {
            const homePos = table.getTableClub(match.homeClubId).position;
            const awayPos = table.getTableClub(match.awayClubId).position;
            
            return {
                match: match,
                rank: homePos + awayPos
            };
        });

        rankMatches.sort((a, b) => a.rank - b.rank);
        return rankMatches.map(m => m.match);
    }

    *getSlot(slots: TimeSlot[]){
        slots.sort((a, b) => a.prime_time - b.prime_time);
        let i = slots.length;
        while(true){
            if (i != 0){
                i--;
            }
            yield slots[i];
        }
    }
}