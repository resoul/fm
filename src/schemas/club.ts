import { z } from 'zod';

export const ClubSchema = z.object({
    id: z.string(),
    name: z.string(),
    leagueId: z.string(),
    pos: z.number(),
    color: z.string(),
    p: z.number(),
    gd: z.number(),
    pts: z.number(),
});

export type Club = z.infer<typeof ClubSchema>;