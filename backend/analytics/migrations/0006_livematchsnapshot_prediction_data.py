# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('analytics', '0005_live_match_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='livematchsnapshot',
            name='prediction_data',
            field=models.JSONField(
                blank=True,
                help_text='Dict com predicoes do modelo ML no momento do jogo ao vivo.',
                null=True,
                verbose_name='Dados de Predicao',
            ),
        ),
    ]
