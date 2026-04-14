import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const mangerHandlers = [
  http.get('/manager', () => {
    return HttpResponse.json(db.manager.findFirst());
  }),
]