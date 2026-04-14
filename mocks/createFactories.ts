import { continentsCreate } from './factories/continents';
import { countriesCreate } from './factories/countries';
import { competitionsCreate } from './factories/competitions';
import { clubsCreate } from './factories/clubs';
import { managerCreate } from './factories/manager';
import { schedulesCreate } from './factories/schedules';

export default async function createFactories() {
    await continentsCreate();
    await countriesCreate();
    await competitionsCreate();
    await clubsCreate();
    await managerCreate();
    await schedulesCreate();
}