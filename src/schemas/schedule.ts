import { z } from 'zod';

export const ScheduleSchema = z.object({
    id: z.number(),
    homeClubId: z.number(),
    awayClubId: z.number(),
    date: z.string(),
    time: z.string(),
    competition: z.string(),
    venue: z.string(),
    status: z.string(),
    homeScore: z.number(),
    awayScore: z.number(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;
