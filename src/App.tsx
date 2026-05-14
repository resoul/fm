import { ThemeProvider } from 'next-themes';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { ModuleProvider } from "./providers/module-provider";
import { LoadingBarContainer } from 'react-top-loading-bar';
import { Toaster } from '@/components/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import DayTransitionModule from './modules/day-transition/index';
import useDatabaseSync from '../db/useDatabaseSync';
import { ScreenLoader } from '@/components/screen-loader';
import RouterProvider from './providers/RouterProvider';
import { useManager } from './state/useManager';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '@/../db/db';

const { BASE_URL } = import.meta.env;

export default function App() {
    const isDatabaseReady = useDatabaseSync();
    const changeManager = useManager(state => state.changeManager);
    const manager = useLiveQuery(
        async () => {
            const manager = await db.table('manager').get(1);
            changeManager(manager);
            return manager;
        }
    );

    if (!isDatabaseReady || !manager || manager.id == 0) {
        return <ScreenLoader />;
    }

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
                        <RouterProvider >
                            <QueryClientProvider client={queryClient}>
                                <Toaster />
                                <DayTransitionModule />
                                <ModuleProvider />
                            </QueryClientProvider>
                        </RouterProvider>
                    </BrowserRouter>
                </LoadingBarContainer>
            </HelmetProvider>
        </ThemeProvider>
    )
}
