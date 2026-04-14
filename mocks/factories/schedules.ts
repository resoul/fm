import { db } from '../db';

const scheduleFixturesData = [
  {
    date: '2026-04-20',
    time: '20:00',
    competition: 'Serie A',
    home: 'Juventus',
    away: 'Inter Milan',
    venue: 'Allianz Stadium',
    status: 'Upcoming',
  },
  {
    date: '2026-04-27',
    time: '18:30',
    competition: 'Serie A',
    home: 'Atalanta',
    away: 'Juventus',
    venue: 'Gewiss Stadium',
    status: 'Upcoming',
  },
  {
    date: '2026-05-04',
    time: '21:00',
    competition: 'Coppa Italia',
    home: 'Juventus',
    away: 'Napoli',
    venue: 'Allianz Stadium',
    status: 'Upcoming',
  },
  {
    date: '2026-05-11',
    time: '20:45',
    competition: 'Serie A',
    home: 'Fiorentina',
    away: 'Juventus',
    venue: 'Artemio Franchi',
    status: 'Upcoming',
  },
];

let scheduleId = 1;

export const schedulesCreate = async () => {
  const clubs = db.club.findMany();

  scheduleFixturesData.forEach(async (fixture) => {
    const homeClub = clubs.find((club) => club.name === fixture.home);
    const awayClub = clubs.find((club) => club.name === fixture.away);

    if (!homeClub || !awayClub) {
      throw new Error(
        `Schedule factory requires both clubs to exist: ${fixture.home} / ${fixture.away}`
      );
    }

    await db.schedule.create({
      id: scheduleId++,
      homeClubId: homeClub.id,
      awayClubId: awayClub.id,
      date: fixture.date,
      time: fixture.time,
      competition: fixture.competition,
      venue: fixture.venue,
      status: fixture.status,
      homeScore: 0,
      awayScore: 0,
    });
  });
};
