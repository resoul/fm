import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/layout';
import { SectionLayout } from '@/layout/components/section-layout';
import { getMenuItems } from './layout/menus';
import { Page as OverviewPage } from './pages/overview/page';
import { Page as TeamPage } from './pages/team/page';
import { Page as PlayerPage } from './pages/player/page';

export default function LeagueModule() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<SectionLayout menu={getMenuItems()} />}>
          <Route index element={<OverviewPage />} />
          <Route path="team/:clubId" element={<TeamPage />} />
          <Route path="team/:clubId/player/:playerId" element={<PlayerPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
