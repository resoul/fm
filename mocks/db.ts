import { Collection } from '@msw/data';
import { CompetitionSchema } from '@/schemas/competition';
import { ContinentSchema } from '@/schemas/continent';
import { CountrySchema } from '@/schemas/country';
import { ManagerSchema } from '@/schemas/manager';
import { ClubSchema } from '@/schemas/club';
import { ScheduleSchema } from '@/schemas/schedule';
import { CompetitionClubSchema } from '@/schemas/competionClub';
import { MatchSchema } from '@/schemas/match';

const managers = new Collection({ schema: ManagerSchema });
const continents = new Collection({ schema: ContinentSchema });
const countries = new Collection({ schema: CountrySchema });
const competitions = new Collection({ schema: CompetitionSchema });
const clubs = new Collection({ schema: ClubSchema });
const competitionClub = new Collection({ schema: CompetitionClubSchema });
const schedules = new Collection({ schema: ScheduleSchema });
const matches = new Collection({ schema: MatchSchema });

// competitions.defineRelations(({ many }) => ({
//     clubs: many(clubs)
// }));

export const db = {
    manager: managers,
    continent: continents,
    country: countries,
    competition: competitions,
    club: clubs,
    competitionClub: competitionClub,
    schedule: schedules,
    matches: matches,
};