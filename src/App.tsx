import { ThemeProvider } from 'next-themes';
import { HelmetProvider } from '@packages/react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { ModuleProvider } from "./providers/module-provider";
import { AuthProvider } from "./providers/auth-provider";
import { LoadingBarContainer } from 'react-top-loading-bar';
import { Toaster } from '@/components/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { BASE_URL } = import.meta.env;

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
        // Чтобы данные не считались "старыми" сразу и не перезапрашивались лишний раз
        staleTime: 1000 * 60 * 5, // 5 минут
        retry: 1, // количество попыток при ошибке
        },
    },
});

export default function App() {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            storageKey="vite-theme"
            enableSystem
            disableTransitionOnChange
            enableColorScheme
        >
            <HelmetProvider>
                <LoadingBarContainer>
                    <BrowserRouter basename={BASE_URL}>
                        <QueryClientProvider client={queryClient}>
                            <AuthProvider>
                                <Toaster />
                                <ModuleProvider />
                            </AuthProvider>
                        </QueryClientProvider>
                    </BrowserRouter>
                </LoadingBarContainer>
            </HelmetProvider>
        </ThemeProvider>
    )
}
