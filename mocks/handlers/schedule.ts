import { http, HttpResponse } from 'msw';
import { db } from '../db';
import nextDateTime from '@/lib/date/nextDateTime';

export const scheduleHandlers = [

    http.get('/schedule/match', () => {
        const leguaId = db.competition.findFirst(c => c.where({name: 'Seria A'}))?.id;
        const matches = db.matches.findMany(m => m.where({competitionId: leguaId}));
        return HttpResponse.json(matches);
    }),

    http.get('/schedule/club/:clubId', (req) => {
        const { clubId } = req.params;
        const matchs = db.matches.findMany(m => m.or(
            m.where({homeClubId: Number(clubId)}),
            m.where({awayClubId: Number(clubId)})
        ));
        
        console.log("Found matches for clubId", matchs);

        const matchesWithNames  =matchs.map(m => {
            const homeClub = db.club.findFirst(c => c.where({id: m.homeClubId}));
            const awayClub = db.club.findFirst(c => c.where({id: m.awayClubId}));
            return {
                ...m,
                venue: m.homeClubId === Number(clubId) ? 'H' : 'A',
                homeClubName: homeClub?.name || 'Unknown',
                awayClubName: awayClub?.name || 'Unknown'
            }
        });

        return HttpResponse.json(matchesWithNames);
    }),

    http.post('/schedule/match', () => {
        const leguaId = db.competition.findFirst(c => c.where({name: 'Seria A'}))?.id;

        if (!leguaId) {
            console.error("Legua not found!");
            return;
        }

        const clubIds = db.competitionClub.findMany(c => c.where({competitionId: leguaId}))
            .map(cc => cc.clubId);

        const numClubs = clubIds.length;
        const numRounds = (numClubs - 1) * 2;

        for (let round = 0; round < numRounds; round++) {           
            let date = nextDateTime(new Date('2024-06-01T13:00:00'), round * 7 * 24);
            for (let i = 0; i < numClubs / 2; i++) {
                let h= ( round + i ) % numClubs;
                let a= ( round + numClubs - 1 - i ) % numClubs;
                db.matches.create({
                    homeClubId: clubIds[h],
                    awayClubId: clubIds[a],
                    date: date.toISOString().split('T')[0],
                    time: '16:00',
                    competitionId: leguaId,
                });
            }
        }

        return HttpResponse.json([]);
    }),
]

