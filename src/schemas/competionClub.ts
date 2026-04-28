import {z} from 'zod';

export const CompetitionClubSchema = z.object({
    id: z.number(),
    clubId: z.number(),
    competitionId: z.number(),
});

export type CompetitionClub = z.infer<typeof CompetitionClubSchema>;