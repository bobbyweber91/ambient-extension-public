from django.db import models


class PageSubmission(models.Model):
    """
    Stores URLs submitted by users when the calendar agent encounters
    an unrecognized calendar platform. Used to prioritize which platforms
    to build deterministic extractors for next.
    """
    url = models.URLField(max_length=2048)
    domain = models.CharField(max_length=255, db_index=True)
    page_title = models.CharField(max_length=512, blank=True, default='')
    google_user_id = models.CharField(max_length=128, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.domain} — {self.url[:80]}"
