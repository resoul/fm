import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const mangerHandlers = [
  http.get('/manager', () => {
    console.log(db.manager.getAll()[0]);
    return HttpResponse.json(db.manager.getAll()[0] || null);
  }),
]