import nextDateTime from "@/lib/date/nextDateTime";
import type { IEvent } from "./IEvent";
import db from "@/../db/db";

export default class DrawEvent implements IEvent {

    async dispatch(dateTime: Date) {
        const draws = await db.table('draw').where('date').equals(dateTime.toISOString().slice(0, 19)).toArray();
        for (const draw of draws) {
            await this.createSeasonSchedule(draw);
        }
    }

    private async createSeasonSchedule(draw: {seasonId: number}) {
        const clubIds = (await db.table('seasonClub').where('seasonId').equals(draw.seasonId).toArray()).map(c => c.clubId || 0);

        const numClubs = clubIds.length;
        const numRounds = (numClubs - 1) * 2;

        await db.transaction('rw', [db.table('round'), db.table('match')], async () => {
            for (let round = 0; round < numRounds; round++) {           
                let date = nextDateTime(new Date('2025-06-30T13:00:00'), round * 7 * 24);
                let matches = [];
                
                // Создаем раунд
                let roundId = await db.table('round').add({ 
                    name: `Round ${round + 1}`, 
                    seasonId: draw.seasonId 
                });

                for (let i = 0; i < numClubs / 2; i++) {
                    let h = (round + i) % numClubs;
                    let a = (round + numClubs - 1 - i) % numClubs;
                    
                    matches.push({
                        homeClubId: clubIds[h], 
                        awayClubId: clubIds[a], 
                        date: date.toISOString().slice(0, 19), // обрезаем для красоты
                        roundId: roundId,
                    });
                }
                
                // Добавляем матчи пачкой
                await db.table('match').bulkAdd(matches);
            }
        });
    }
    
}