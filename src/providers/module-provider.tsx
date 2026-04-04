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
    { path: 'club-info', module: lazy(() => import('@/modules/club-info')) },
    { path: 'club-vision', module: lazy(() => import('@/modules/club-vision')) },
    { path: 'competitions', module: lazy(() => import('@/modules/competitions')) },
    { path: 'data-hub', module: lazy(() => import('@/modules/data-hub')) },
    { path: 'dev-centre', module: lazy(() => import('@/modules/dev-centre')) },
    { path: 'medical-centre', module: lazy(() => import('@/modules/medical-centre')) },
    { path: 'staff', module: lazy(() => import('@/modules/staff')) },
    { path: 'squad', module: lazy(() => import('@/modules/squad')) },
    { path: 'tactics', module: lazy(() => import('@/modules/tactics')) },
    { path: 'training', module: lazy(() => import('@/modules/training')) },
    { path: 'scouting', module: lazy(() => import('@/modules/scouting')) },
    { path: 'transfers', module: lazy(() => import('@/modules/transfers')) },
    { path: 'planner', module: lazy(() => import('@/modules/planner')) },
    { path: 'schedule', module: lazy(() => import('@/modules/schedule')) },
    { path: 'dynamics', module: lazy(() => import('@/modules/dynamics')) },
    { path: 'finances', module: lazy(() => import('@/modules/finances')) },
    { path: 'team', module: lazy(() => import('@/modules/team')) },
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
