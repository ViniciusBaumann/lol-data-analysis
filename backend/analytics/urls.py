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
]
