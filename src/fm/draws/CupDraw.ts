import db from "@/../db/db";
import AbstractDraw from "./AbstractDraw";

export default class CupDraw extends AbstractDraw{

    async draw(): Promise<void> {
        const seasonIds = (await db.season.where('competitionId').anyOf(this.stage.teamsFrom).toArray()).map(s => s.id);
        let clubIds = (await db.seasonClub.where('seasonId').anyOf(seasonIds).toArray()).map(c => c.clubId);
        
        if (this.stage!.teamsCount){
            if (clubIds.length > this.stage.teamsCount){
                clubIds = clubIds.slice(0, this.stage.teamsCount);
            } else {
                clubIds.fill(0, this.stage.teamsCount - clubIds.length);
            }
        }

        this.size = clubIds.length;
        
        this.numberOfRounds = this.stage.circle;

        if (this.size < 2 || this.size % 2 !== 0) clubIds.push(0);

        // const pairs: { homeClubId: number, awayClubId: number }[][] = [];
        const roundPairs : { homeClubId: number, awayClubId: number }[] = [];
        for (let i = 0; i < this.size / 2; i++) {
            roundPairs.push({ homeClubId: clubIds[i], awayClubId: clubIds[this.size - 1] });
        }

        this.drawResult.push(roundPairs);
    }

}