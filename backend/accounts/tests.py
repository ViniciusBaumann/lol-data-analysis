from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

User = get_user_model()


class UserModelTests(TestCase):
    """Tests for the custom User model."""

    def test_create_user(self):
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            first_name='Test',
            last_name='User',
            password='testpass123',
        )
        self.assertEqual(user.email, 'test@example.com')
        self.assertEqual(user.first_name, 'Test')
        self.assertEqual(user.last_name, 'User')
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser(self):
        admin_user = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            first_name='Admin',
            last_name='User',
            password='adminpass123',
        )
        self.assertTrue(admin_user.is_staff)
        self.assertTrue(admin_user.is_superuser)

    def test_email_unique(self):
        User.objects.create_user(
            username='user1',
            email='duplicate@example.com',
            password='testpass123',
        )
        with self.assertRaises(Exception):
            User.objects.create_user(
                username='user2',
                email='duplicate@example.com',
                password='testpass123',
            )

    def test_str_representation(self):
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            first_name='Test',
            last_name='User',
            password='testpass123',
        )
        self.assertEqual(str(user), 'Test User (test@example.com)')


class RegisterViewTests(APITestCase):
    """Tests for the user registration endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.register_url = '/api/v1/auth/register/'

    def test_register_success(self):
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'first_name': 'New',
            'last_name': 'User',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.first().email, 'newuser@example.com')

    def test_register_password_mismatch(self):
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'first_name': 'New',
            'last_name': 'User',
            'password': 'StrongPass123!',
            'password_confirm': 'DifferentPass123!',
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate_email(self):
        User.objects.create_user(
            username='existing',
            email='existing@example.com',
            password='testpass123',
        )
        data = {
            'username': 'newuser',
            'email': 'existing@example.com',
            'first_name': 'New',
            'last_name': 'User',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class UserProfileViewTests(APITestCase):
    """Tests for the user profile endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.profile_url = '/api/v1/auth/profile/'
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            first_name='Test',
            last_name='User',
            password='testpass123',
        )

    def test_profile_unauthenticated(self):
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_authenticated(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'test@example.com')

    def test_profile_update(self):
        self.client.force_authenticate(user=self.user)
        data = {'first_name': 'Updated'}
        response = self.client.patch(self.profile_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Updated')


class TokenTests(APITestCase):
    """Tests for JWT token endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.token_url = '/api/v1/auth/token/'
        self.token_refresh_url = '/api/v1/auth/token/refresh/'
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            first_name='Test',
            last_name='User',
            password='testpass123',
        )

    def test_obtain_token(self):
        data = {
            'email': 'test@example.com',
            'password': 'testpass123',
        }
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_obtain_token_wrong_password(self):
        data = {
            'email': 'test@example.com',
            'password': 'wrongpassword',
        }
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token(self):
        # First obtain a token pair
        data = {
            'email': 'test@example.com',
            'password': 'testpass123',
        }
        response = self.client.post(self.token_url, data, format='json')
        refresh_token = response.data['refresh']

        # Then refresh it
        response = self.client.post(
            self.token_refresh_url,
            {'refresh': refresh_token},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
