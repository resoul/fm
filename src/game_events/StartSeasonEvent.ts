import db from "@/../db/db";
import type { IEvent } from "./IEvent";
import type { SeasonClub } from "db/models";

export default class StartSeasonEvent implements IEvent {

    async dispatch(dateTime: string) {
        if (dateTime == '2025-06-29T13:00:00'){
            // console.log(dateTime);
            const clubs = await db.club.where('countryId').equals(1).toArray();
            const seasonClubs: {seasonId: number, clubId: number}[] = [];
            clubs.map(c => seasonClubs.push({seasonId: 15, clubId: c.id}));
            await db.seasonClub.bulkAdd(seasonClubs as SeasonClub[]);
        }
    }
}