"""
URL configuration for django_rest_auth project (Datanalys).
"""

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.db import connection


def health_check(request):
    """Health check endpoint for container orchestration."""
    try:
        # Check database connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    status = "healthy" if db_status == "healthy" else "unhealthy"
    status_code = 200 if status == "healthy" else 503

    return JsonResponse({
        "status": status,
        "database": db_status,
        "service": "datanalys-backend"
    }, status=status_code)


urlpatterns = [
    path('admin/', admin.site.urls),

    # Health check endpoint
    path('api/v1/health/', health_check, name='health-check'),

    # Accounts app endpoints
    path('api/v1/auth/', include('accounts.urls')),

    # Analytics app endpoints
    path('api/v1/analytics/', include('analytics.urls')),
]
