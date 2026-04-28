import { ThemeProvider } from 'next-themes';
import { HelmetProvider } from '@packages/react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { ModuleProvider } from "./providers/module-provider";
import { AuthProvider } from "./providers/auth-provider";
import { LoadingBarContainer } from 'react-top-loading-bar';
import { Toaster } from '@/components/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import DayTransitionModule from './modules/day-transition/index';

const { BASE_URL } = import.meta.env;

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
                                <DayTransitionModule />
                                <ModuleProvider />
                            </AuthProvider>
                        </QueryClientProvider>
                    </BrowserRouter>
                </LoadingBarContainer>
            </HelmetProvider>
        </ThemeProvider>
    )
}
