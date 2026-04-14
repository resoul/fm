import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const clubHandlers = [
    http.get('/leagueClubs/:competitionId', ({ params }) => {

        const { competitionId } = params;
        if (typeof competitionId !== 'string' || isNaN(Number(competitionId))) {
            return HttpResponse.json({ error: 'Competition ID is required' }, { status: 400 });
        }

        return HttpResponse.json(db.club.findMany(
            c => c.where({ competitionId: com => Number(competitionId) === com }
        )));
    }),
];