import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const competitionHandlers = [
  http.get('/competitions', () => {
    return HttpResponse.json(db.competition.findMany());
  }),

  http.get('/competitions/:id', ({ params }) => {
    const { id } = params;

    if (typeof id !== 'number') {
      return HttpResponse.json({ error: 'Competition ID must be a number' }, { status: 400 });
    }

    const competition = db.competition.findFirst(c => c.where({ id: compId => compId === id }));

    return HttpResponse.json(competition || null);
  }),

  http.get('/competition/:id', ({ params }) => {
    const { id } = params;

    if (typeof id !== 'number') {
      return HttpResponse.json({ error: 'Competition ID must be a number' }, { status: 400 });
    }

    const competition = db.competition.findFirst(c => c.where({ id: compId => compId === id }));

    return HttpResponse.json(competition || null);
  }),
];
