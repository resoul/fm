import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { ScreenLoader } from '@/components/screen-loader';

interface ModuleRoute {
    path: string;
    module: LazyExoticComponent<ComponentType>;
}

const routes: ModuleRoute[] = [
    { path: 'home', module: lazy(() => import('@/modules/home')) },
    { path: 'inbox', module: lazy(() => import('@/modules/inbox')) },
    { path: 'competitions', module: lazy(() => import('@/modules/competitions')) },
    { path: 'staff', module: lazy(() => import('@/modules/staff')) },
    { path: 'squad', module: lazy(() => import('@/modules/squad')) },
    { path: 'tactics', module: lazy(() => import('@/modules/tactics')) },
    { path: 'training', module: lazy(() => import('@/modules/training')) },
    { path: 'scouting', module: lazy(() => import('@/modules/scouting')) },
    { path: 'transfers', module: lazy(() => import('@/modules/transfers')) },
    { path: 'schedule', module: lazy(() => import('@/modules/schedule')) },
    { path: 'matches', module: lazy(() => import('@/modules/matches')) },
    { path: 'league/:competitionId', module: lazy(() => import('@/modules/league')) },
];

export function ModuleProvider() {
    return (
        <Routes>
            {routes.map(({ path, module: Module }) => (
                <Route
                    key={path}
                    path={`/${path}/*`}
                    element={
                        <Suspense fallback={<ScreenLoader />}>
                            <Module />
                        </Suspense>
                    }
                />
            ))}
            <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
    );
}
