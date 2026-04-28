import { http, HttpResponse } from 'msw';
import { db } from '../db';

export const clubHandlers = [
    http.get('/leagueClubs/:clubId', ({ params }) => {

        const { clubId } = params;
        if (typeof clubId !== 'string' || isNaN(Number(clubId))) {
            return HttpResponse.json({ error: 'Club ID is required' }, { status: 400 });
        }

        const competion = db.competitionClub.findMany(c => c.where({ clubId: m => Number(clubId) === m })).filter(cc => {
            const comp = db.competition.findFirst(c => c.where({ id: cc.competitionId }));
            return comp?.type === 'league';
        });

        if (competion.length === 0) {
            return HttpResponse.json({ error: 'No league competition found for this club' }, { status: 404 });
        }

        const clubs = db.competitionClub.findMany(
            c => c.where({ competitionId: com => Number(competion[0].competitionId) === com }
        )).map(cc => {
            return db.club.findFirst(c => c.where({ id: cc.clubId }));
        });

        return HttpResponse.json(clubs);
    }),
];