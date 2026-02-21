import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import DashboardPage from '@/pages/DashboardPage';
import TeamsPage from '@/pages/TeamsPage';
import LeagueTeamsPage from '@/pages/LeagueTeamsPage';
import TeamDetailPage from '@/pages/TeamDetailPage';
import ComparePage from '@/pages/ComparePage';
import DraftComparePage from '@/pages/DraftComparePage';
import ChampionMatchupsPage from '@/pages/ChampionMatchupsPage';
import MatchesPage from '@/pages/MatchesPage';
import LeagueMatchesPage from '@/pages/LeagueMatchesPage';
import MatchDetailPage from '@/pages/MatchDetailPage';
import LiveGamesPage from '@/pages/LiveGamesPage';
import LiveGameDetailPage from '@/pages/LiveGameDetailPage';
import SettingsPage from '@/pages/SettingsPage';
import MockLiveTestPage from '@/pages/MockLiveTestPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/live" element={<LiveGamesPage />} />
          <Route path="/live/:matchId" element={<LiveGameDetailPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/league/:leagueId" element={<LeagueTeamsPage />} />
          <Route path="/teams/:id" element={<TeamDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/draft" element={<DraftComparePage />} />
          <Route path="/matchups" element={<ChampionMatchupsPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/matches/league/:leagueId" element={<LeagueMatchesPage />} />
          <Route path="/matches/:id" element={<MatchDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/mock-live" element={<MockLiveTestPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
