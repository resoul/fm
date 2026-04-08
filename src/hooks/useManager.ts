import { useQuery } from '@tanstack/react-query';

export function useManager() {
    return useQuery({
        queryKey: ['manager'],
        queryFn: async () => {
            const response = await fetch('/manager');
            if (!response.ok) {
                throw new Error('Failed to fetch manager');
            }
            return response.json();
        },
    });
}