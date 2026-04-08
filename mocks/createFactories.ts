import { leaguesCreate } from './factories/leagues';
import { clubsCreate } from './factories/clubs';
import { managerCreate } from './factories/manager';

export default function createFactories() {
    leaguesCreate();
    clubsCreate();
    managerCreate();
}