import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import DashboardPage from '@/pages/DashboardPage';
import TeamsPage from '@/pages/TeamsPage';
import TeamDetailPage from '@/pages/TeamDetailPage';
import ComparePage from '@/pages/ComparePage';
import MatchesPage from '@/pages/MatchesPage';
import LeagueMatchesPage from '@/pages/LeagueMatchesPage';
import MatchDetailPage from '@/pages/MatchDetailPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:id" element={<TeamDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/matches/league/:leagueId" element={<LeagueMatchesPage />} />
          <Route path="/matches/:id" element={<MatchDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
