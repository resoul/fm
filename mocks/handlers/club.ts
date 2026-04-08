import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const clubHandlers = [
    http.get('/leagueClubs/:leagueId', ({ params }) => {

        const { leagueId } = params;

        if (!leagueId || typeof leagueId !== 'string') {
        return HttpResponse.json({ error: 'League ID is required' }, { status: 400 });
        }

        return HttpResponse.json(db.club.findMany(
            {
                where: {
                    leagueId: {
                        equals: leagueId
                    }
                }
            }
        ));  
    }),
];