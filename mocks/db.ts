import { Collection } from '@msw/data';
import { CompetitionSchema } from '@/schemas/competition';
import { ContinentSchema } from '@/schemas/continent';
import { CountrySchema } from '@/schemas/country';
import { ManagerSchema } from '@/schemas/manager';
import { ClubSchema } from '@/schemas/club';
import { ScheduleSchema } from '@/schemas/schedule';

export type { Manager } from '@/schemas/manager';
export type { Continent } from '@/schemas/continent';
export type { Country } from '@/schemas/country';
export type { Competition } from '@/schemas/competition';
export type { Club } from '@/schemas/club';
export type { Schedule } from '@/schemas/schedule';

const managers = new Collection({ schema: ManagerSchema });
const continents = new Collection({ schema: ContinentSchema });
const countries = new Collection({ schema: CountrySchema });
const competitions = new Collection({ schema: CompetitionSchema });
const clubs = new Collection({ schema: ClubSchema });
const schedules = new Collection({ schema: ScheduleSchema });

// competitions.defineRelations(({ many }) => ({
//     clubs: many(clubs)
// }));

export const db = {
    manager: managers,
    continent: continents,
    country: countries,
    competition: competitions,
    club: clubs,
    schedule: schedules,
};