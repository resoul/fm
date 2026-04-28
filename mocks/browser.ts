import { setupWorker } from 'msw/browser';
import { mangerHandlers } from './handlers/manager';
import { clubHandlers } from './handlers/club';
import { competitionHandlers } from './handlers/competition';
import { locationHandlers } from './handlers/locations';
import { scheduleHandlers } from './handlers/schedule';

export const worker = setupWorker(
    ...locationHandlers,
    ...competitionHandlers,
    ...mangerHandlers,
    ...clubHandlers,
    ...scheduleHandlers
);