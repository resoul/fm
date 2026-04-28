import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
        // Чтобы данные не считались "старыми" сразу и не перезапрашивались лишний раз
        staleTime: 1000 * 60 * 5, // 5 минут
        retry: 1, // количество попыток при ошибке
        },
    },
});