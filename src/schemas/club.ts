import { z } from 'zod';

export const ClubSchema = z.object({
    id: z.number(),
    name: z.string(),
    competitionId: z.number(),
    pos: z.number(),
    color: z.string(),
    p: z.number(),
    gd: z.number(),
    pts: z.number(),
});

export type Club = z.infer<typeof ClubSchema>;