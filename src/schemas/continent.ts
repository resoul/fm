import { z } from 'zod';

export const ContinentSchema = z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
});

export type Continent = z.infer<typeof ContinentSchema>;
