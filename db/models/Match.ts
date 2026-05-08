import type { Club } from "./Club";

export class Match{
    id!: number;
    date!: string;
    homeClubId!: number;
    awayClubId!: number;
    roundId!: number;

    getVenue(club: Club){
        if(club.id == this.homeClubId) {
            return 'H';
        } else {
            return 'A';
        }
    }

}