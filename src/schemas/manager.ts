import { z } from 'zod';

export const ManagerSchema = z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    competitionId: z.number(),
    clubId: z.number(),
});

export type Manager = z.infer<typeof ManagerSchema>;
