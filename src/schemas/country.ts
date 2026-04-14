import { z } from 'zod';

export const CountrySchema = z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    continentId: z.number(),
});

export type Country = z.infer<typeof CountrySchema>;
