"""
URL configuration for django_rest_auth project (Datanalys).
"""

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),

    # Accounts app endpoints
    path('api/v1/auth/', include('accounts.urls')),

    # Analytics app endpoints
    path('api/v1/analytics/', include('analytics.urls')),
]
