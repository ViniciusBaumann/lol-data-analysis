# Migration: Rebuild TeamEloRating with per-league + side ELO fields.
# Data will be repopulated via `calculate_elo --reset`.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('analytics', '0003_teamelorating'),
    ]

    operations = [
        # Drop old table
        migrations.DeleteModel(
            name='TeamEloRating',
        ),
        # Recreate with new schema
        migrations.CreateModel(
            name='TeamEloRating',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('elo_rating', models.FloatField(default=1500.0, verbose_name='ELO Rating')),
                ('elo_rating_blue', models.FloatField(default=1500.0, verbose_name='ELO (Blue Side)')),
                ('elo_rating_red', models.FloatField(default=1500.0, verbose_name='ELO (Red Side)')),
                ('matches_played', models.IntegerField(default=0, verbose_name='Partidas Jogadas')),
                ('last_change', models.FloatField(default=0.0, verbose_name='Ultima Variacao')),
                ('last_change_blue', models.FloatField(default=0.0, verbose_name='Var. Blue')),
                ('last_change_red', models.FloatField(default=0.0, verbose_name='Var. Red')),
                ('last_match_date', models.DateTimeField(blank=True, null=True, verbose_name='Data da Ultima Partida')),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='elo_ratings', to='analytics.team', verbose_name='Time')),
                ('league', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='elo_ratings', to='analytics.league', verbose_name='Liga')),
            ],
            options={
                'verbose_name': 'ELO Rating',
                'verbose_name_plural': 'ELO Ratings',
                'ordering': ['-elo_rating'],
                'unique_together': {('team', 'league')},
            },
        ),
    ]
