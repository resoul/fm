import { setupWorker } from 'msw/browser';
import { db } from './db';
import { mangerHandlers } from './handlers/manager';
import { clubHandlers } from './handlers/club';

export const worker = setupWorker(
  ...db.league.toHandlers('rest'),
  ...db.club.toHandlers('rest'),
  ...mangerHandlers,
  ...clubHandlers,
);