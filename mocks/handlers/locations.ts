import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const locationHandlers = [
  http.get('/countries', () => {
    return HttpResponse.json({ countries: db.country.getAll() });
  }),
  http.get('/continents', () => {
    return HttpResponse.json({ continents: db.continent.getAll() });
  }),
];
