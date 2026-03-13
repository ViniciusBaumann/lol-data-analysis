from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"leagues", views.LeagueViewSet)
router.register(r"teams", views.TeamViewSet)
router.register(r"matches", views.MatchViewSet)
router.register(r"players", views.PlayerViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("compare/", views.CompareView.as_view(), name="compare"),
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("standings/", views.StandingsView.as_view(), name="standings"),
    path("import/", views.ImportView.as_view(), name="import-data"),
    path("predict/", views.PredictView.as_view(), name="predict"),
    path("filter-options/", views.FilterOptionsView.as_view(), name="filter-options"),
    path("elo/", views.EloRatingsView.as_view(), name="elo-ratings"),
    path("champions/", views.ChampionListView.as_view(), name="champion-list"),
    path("draft-predict/", views.DraftPredictView.as_view(), name="draft-predict"),
    path("champion-matchups/", views.ChampionMatchupsView.as_view(), name="champion-matchups"),
    path("live/", views.LiveGamesView.as_view(), name="live-games"),
    path("live/<str:match_id>/", views.LiveMatchDetailView.as_view(), name="live-match-detail"),
    path("schedule/", views.ScheduleView.as_view(), name="schedule"),
    path("data-health/", views.DataHealthView.as_view(), name="data-health"),
]
