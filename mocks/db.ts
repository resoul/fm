import { factory, primaryKey } from '@mswjs/data';

export const db = factory({
    manager: {
        id: primaryKey(() => crypto.randomUUID()),
        name: String,
        age: Number,
        leagueId: String,
        clubId: String,
    },
    league: {
        id: primaryKey(() => crypto.randomUUID()),
        name: String,
        country: String,
    },
    club: {
        id: primaryKey(() => crypto.randomUUID()),
        name: String,
        leagueId: String,
        pos: Number,
        color: String,
        p: Number,
        gd: Number,
        pts: Number,
    },
});

