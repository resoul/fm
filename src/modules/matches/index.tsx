import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from "@/layout";
import { Page } from './pages/results/page';

export default function MatchesModule() {

    return (
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<Navigate to="results" replace />} />

                <Route path="results" element={<Page />} />
                <Route path="results/:competitionId" element={<Page />} />
            </Route>
        </Routes>
    )
}
