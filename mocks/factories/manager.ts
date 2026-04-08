import { db } from '../db';

export const managerCreate = () => {
    const club = db.club.findFirst({
        where: { 
            name: {
                equals: 'Juventus'
            } 
        }
    });

    if (!club) {
        throw new Error('Club not found');
    }

    db.manager.create({
        name: 'Yurii Maksymov',
        age: 45,
        clubId: club.id,
        leagueId: club.leagueId,
    });
}