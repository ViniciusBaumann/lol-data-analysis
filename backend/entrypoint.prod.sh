#!/bin/bash
set -e

echo "=============================================="
echo "  Datanalys Backend - Production Startup"
echo "=============================================="

# Wait for PostgreSQL
echo "[1/6] Waiting for PostgreSQL..."
max_retries=30
counter=0
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q; do
    counter=$((counter + 1))
    if [ $counter -ge $max_retries ]; then
        echo "ERROR: PostgreSQL did not become ready in time"
        exit 1
    fi
    echo "PostgreSQL not ready. Retry $counter/$max_retries..."
    sleep 2
done
echo "PostgreSQL is ready!"

# Run migrations
echo "[2/6] Running database migrations..."
python manage.py migrate --noinput

# Collect static files
echo "[3/6] Collecting static files..."
python manage.py collectstatic --noinput --clear

# Create superuser if not exists
echo "[4/6] Ensuring admin user exists..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
import os

User = get_user_model()
admin_email = os.environ.get('ADMIN_EMAIL', 'admin@datanalys.com')
admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123secure')

if not User.objects.filter(email=admin_email).exists():
    User.objects.create_superuser(
        username='admin',
        email=admin_email,
        password=admin_password,
        first_name='Admin',
        last_name='Datanalys'
    )
    print(f'Superuser created: {admin_email}')
else:
    print('Superuser already exists.')
" 2>/dev/null || echo "Superuser creation skipped."

# Create health check endpoint view if not exists
echo "[5/6] Setting up health check..."
python manage.py shell -c "
# Health check is handled by Django views
print('Health check endpoint: /api/v1/health/')
" 2>/dev/null || true

echo "[6/6] Starting Gunicorn server..."
echo "=============================================="

# Execute the main command (Gunicorn)
exec "$@"
