import { z } from 'zod';

export const CompetionEnum = z.enum(['league', 'cup']);

export const CompetitionSchema = z.object({
    id: z.number(),
    name: z.string(),
    continentId: z.number(),
    countryId: z.number(),
    type: CompetionEnum,
});

export type Competition = z.infer<typeof CompetitionSchema>;
