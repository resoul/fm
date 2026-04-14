import { setupWorker } from 'msw/browser';
import { mangerHandlers } from './handlers/manager';
import { clubHandlers } from './handlers/club';
import { competitionHandlers } from './handlers/competition';
import { locationHandlers } from './handlers/locations';

export const worker = setupWorker(
    ...locationHandlers,
    ...competitionHandlers,
    ...mangerHandlers,
    ...clubHandlers,
);