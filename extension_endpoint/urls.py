"""
URL patterns for extension_endpoint app.
"""
from django.urls import path
from . import views

app_name = 'extension_endpoint'

urlpatterns = [
    path('extract_event/', views.extract_event, name='extract_event'),
    path('extract_from_file/', views.extract_from_file, name='extract_from_file'),
    path('find_matches/', views.find_matches, name='find_matches'),
    path('health/', views.health_check, name='health_check'),
    path('check_profile/', views.check_profile, name='check_profile'),
]
