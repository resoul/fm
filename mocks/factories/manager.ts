import { db } from '../db';

export const managerCreate = async () => {
    const club = db.club.findFirst(c => c.where({ name: 'Juventus' }));

    if (!club) {
        throw new Error('Club not found');
    }

    await db.manager.create({
        id: crypto.randomUUID(),
        name: 'Yurii Maksymov',
        age: 45,
        clubId: club.id,
        competitionId: club.competitionId,
    });
}