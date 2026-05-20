import type { Club, Competition } from "db/models";
import { Match } from "@/../db/models/Match";

export default class Schedule{

    club: Club;
    fixtures: Fixture[] = [];
    static competitionArray: Record<number, Competition> = {};

    constructor(club: Club){
        this.club = club;
    }

    async addFixture(match: Match, rival: Club){
        if (!Schedule.competitionArray[match.seasonId]){
            const season = await match.getSeason();
            const competition = await season.getCompetition();
            Schedule.competitionArray[match.seasonId] = competition;
        }
        this.fixtures.push(new Fixture(this.club, rival, match, Schedule.competitionArray[match.seasonId]));
    }

    getFixtures(): Fixture[]{
        return this.fixtures;
    }

    
}

class Fixture{

    club: Club;
    rival: Club;
    match: Match;
    competition: Competition;

    constructor(club: Club, rival: Club, match: Match, competition: Competition){
        this.club = club;
        this.rival = rival;
        this.match = match;
        this.competition = competition;
    }

    getPlace(): string{
        if (this.club.id == this.match.homeClubId){
            return 'H';
        }
        
        return 'A';
    }

}