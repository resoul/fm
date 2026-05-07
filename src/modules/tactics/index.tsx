import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from "@/layout";
import { SectionLayout } from "@/layout/components/section-layout";
import { getMenuItems } from "./layout/menus";
import { OverviewPage } from "./pages/overview/page";
import { Page } from "./pages/player/page";

export default function TacticsModule() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route element={<SectionLayout menu={getMenuItems()}/>}>
                    <Route index element={<Navigate to="overview" replace />} />

                    <Route path="overview" element={<OverviewPage />} />
                    <Route path="player" element={<Page />} />
                    <Route path="captains" element={<Page />} />
                    <Route path="set-piece-takers" element={<Page />} />
                    <Route path="match-plans" element={<Page />} />
                    <Route path="opposition-instructions" element={<Page />} />
                    <Route path="corners" element={<Page />} />
                    <Route path="free-kicks" element={<Page />} />
                    <Route path="throw-ins" element={<Page />} />
                    <Route path="penalties" element={<Page />} />
                </Route>
            </Route>
        </Routes>
    )
}
