import type { Club } from "@/schemas/club";
import Draw from "./Draw";
import { type Match } from "@/schemas/match";


export default class LeagueDraw extends Draw {

    generate(): void {
        const matches: Match[] = [];
        const numClubs = this.clubs.length;
        const numRounds = (numClubs - 1) * 2;

        for (let round = 0; round < numRounds; round++) {           
            for (let i = 0; i < numClubs / 2; i++) {
                matches.push({
                    homeClubId: this.clubs[i].id,
                    awayClubId: this.clubs[numClubs - 1 - i].id,
                    date: '', // TODO: generate date based on round
                    time: '16:00', // TODO: generate time based on round
                    competitionId: this.competition.id, // TODO: set competition name
                });
            }
        }
    }

}