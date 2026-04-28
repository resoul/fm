import { z } from 'zod';

export const MatchSchema = z.object({
    // id: z.number(),
    homeClubId: z.number(),
    awayClubId: z.number(),
    date: z.string(),
    time: z.string(),
    competitionId: z.number(),
    // venue: z.string(),
    // status: z.string(),
    // homeScore: z.number(),
    // awayScore: z.number(),
});

export type Match = z.infer<typeof MatchSchema>;
