from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom User model for Datanalys.
    Extends AbstractUser with email as a unique field.
    """
    email = models.EmailField(
        'email',
        unique=True,
        error_messages={
            'unique': 'Um usuario com este email ja existe.',
        },
    )
    first_name = models.CharField('nome', max_length=150)
    last_name = models.CharField('sobrenome', max_length=150)
    is_active = models.BooleanField('ativo', default=True)
    date_joined = models.DateTimeField('data de cadastro', auto_now_add=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']

    class Meta:
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'
        ordering = ['-date_joined']

    def __str__(self):
        return f'{self.first_name} {self.last_name} ({self.email})'
