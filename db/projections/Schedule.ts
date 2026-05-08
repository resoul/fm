import type { Club } from "db/models";
import { Match } from "@/../db/models/Match";

export default class Schedule{

    club: Club;
    fixtures: Fixture[] = [];

    constructor(club: Club){
        this.club = club;
    }

    addFixture(match: Match, rival: Club){
        this.fixtures.push(new Fixture(this.club, rival, match));
    }

    getFixtures(): Fixture[]{
        return this.fixtures;
    }

    
}

class Fixture{

    club: Club;
    rival: Club;
    match: Match;

    constructor(club: Club, rival: Club, match: Match){
        this.club = club;
        this.rival = rival;
        this.match = match;
    }

    getPlace(): string{
        if (this.club.id == this.match.homeClubId){
            return 'H';
        }
        
        return 'A';
    }

}