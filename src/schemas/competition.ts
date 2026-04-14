import { z } from 'zod';

export const CompetitionSchema = z.object({
    id: z.number(),
    name: z.string(),
    continentId: z.number(),
    countryId: z.number(),
});

export type Competition = z.infer<typeof CompetitionSchema>;
