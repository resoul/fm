import db from "@/../db/db";
import AbstractDraw from "./AbstractDraw";

export default class CupDraw extends AbstractDraw{

    async draw(): Promise<void> {
        const seasonIds = (await db.season.where('competitionId').anyOf(this.stage.teamsFrom).toArray()).map(s => s.id);
        let clubIds = (await db.seasonClub.where('seasonId').anyOf(seasonIds).toArray()).map(c => c.clubId);
        const previousStage = await this.stage.getPreviousStage();

        if (previousStage){
            const previousClubIds = (await previousStage.getMatches()).map(m => m.getWinnerId());
            clubIds = [...clubIds, ...previousClubIds];
        }

        if (this.stage!.teamsCount ){
            if (clubIds.length > this.stage.teamsCount){
                clubIds = clubIds.slice(0, this.stage.teamsCount);
            } else {
                clubIds.fill(0, this.stage.teamsCount);
            }
        }

        this.size = clubIds.length;
        
        this.numberOfRounds = this.stage.circle;

        if (this.size < 2 || this.size % 2 !== 0) clubIds.push(0);

        // const pairs: { homeClubId: number, awayClubId: number }[][] = [];
        const roundPairs : { homeClubId: number, awayClubId: number }[] = [];
        for (let i = 0; i < this.size / 2; i++) {
            roundPairs.push({ homeClubId: clubIds[i], awayClubId: clubIds[this.size - i - 1] });
        }

        this.drawResult.push(roundPairs);
    }

}