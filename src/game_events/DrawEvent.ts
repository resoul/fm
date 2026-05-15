import nextDateTime from "@/lib/date/nextDateTime";
import type { IEvent } from "./IEvent";
import db from "@/../db/db";
import { Round, Stage, MatchStatusEnum, Match, StageEnum } from "@/../db/models";
import DrawFactory from "@/fm/draws/DrawFactory";

export default class DrawEvent implements IEvent {

    async dispatch(dateTime: string) {
        const stages = await db.table<Stage>('stage').where('drawDate').equals(dateTime).toArray();
        for (const stage of stages) {
            // if (stage.type == StageEnum.group){
                await this.drawStage(stage);
            // }
        }
    }

    private async drawStage(stage: Stage){
        const draw = await DrawFactory.getDraw(stage);
        const season = await stage.getSeason();
        await draw.draw();

        await db.transaction('rw', [db.round, db.match, db.competition], async () => {
            for (let round = 0; round < draw.numberOfRounds; round++) {           
                let date = nextDateTime(new Date(stage.startDate), round * 7 * 24);
                let matches: Pick<Match, 'homeClubId'|'awayClubId'|'date'|'roundId'|'stageId'|'status'>[]  = [];
                
                const sD = date.toISOString().slice(0, 19);
                const roundId = await db.table<Pick<Round, 'name'|'stageId'|'seasonId'|'startDate'|'drawDate'>>('round').add({ 
                    name: `Round ${round + 1}`,  
                    stageId: stage.id, 
                    seasonId: season.id,
                    startDate: sD,
                    drawDate: nextDateTime(new Date(stage.startDate), round * 7 * 24 - 30 * 24).toISOString().slice(0, 19)
                });
                
                for (const pair of draw.drawResult[round]) {
                    matches.push({
                        homeClubId: pair.homeClubId,
                        awayClubId: pair.awayClubId,
                        date: sD,
                        roundId: Number(roundId),
                        stageId: stage.id,
                        status: MatchStatusEnum.created,
                    });
                }

                await db.table('match').bulkAdd(matches);
            }
        });
    }
}
