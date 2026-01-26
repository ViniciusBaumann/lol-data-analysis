#!/bin/bash
set -e

echo "Waiting for PostgreSQL to be ready..."

while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q; do
    echo "PostgreSQL is not ready yet. Retrying in 2 seconds..."
    sleep 2
done

echo "PostgreSQL is ready."

echo "Generating migrations..."
python manage.py makemigrations accounts --noinput
python manage.py makemigrations analytics --noinput

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "Creating superuser if not exists..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email='admin@admin.com').exists():
    User.objects.create_superuser(
        username='admin',
        email='admin@admin.com',
        password='admin',
        first_name='Admin',
        last_name='User'
    )
    print('Superuser created: admin@admin.com / admin')
else:
    print('Superuser already exists.')
" 2>/dev/null || echo "Superuser creation skipped (model may require different fields)."

echo "Importing Oracle's Elixir 2026 data (if not already imported)..."
python manage.py import_oracle_data --year 2026 --download || echo "Import skipped or failed (non-fatal)."

echo "Starting application..."
exec "$@"
