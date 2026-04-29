"""
Notification HTTP routes -- the bell-icon dropdown calls these.

All endpoints are mounted under ``/api/notifications`` and require
the standard bearer-token auth. Per-user scoping lives inside the
service layer (every query filters on ``user_id``), so a malicious
client can't read or ack anyone else's notifications even by guessing
ids.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Path

from app.dependencies import require_user
from app.models.schemas import (
    NotificationItem,
    NotificationListResponse,
    NotificationPreferencesPayload,
    NotificationPreferencesResponse,
    SimpleMessageResponse,
    UnreadCountResponse,
)
from app.services import notification_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    limit: int = 20,
    current_user: Dict[str, Any] = Depends(require_user),
) -> NotificationListResponse:
    """Recent notifications for the bell-icon dropdown."""
    user_id = int(current_user["id"])
    rows = notification_service.list_for_user(user_id, limit=limit)
    items = [
        NotificationItem(
            id=int(r["id"]),
            kind=str(r["kind"]),
            title=str(r["title"]),
            body=str(r["body"]),
            link_url=r.get("link_url"),
            read_at=r.get("read_at"),
            created_at=r["created_at"],
        )
        for r in rows
    ]
    return NotificationListResponse(
        items=items,
        unread_count=notification_service.unread_count(user_id),
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    current_user: Dict[str, Any] = Depends(require_user),
) -> UnreadCountResponse:
    """
    Cheap counter for the badge on the bell. The frontend polls this
    every ~60s; we keep the response shape small (single integer) so
    polling stays cheap on bandwidth and CPU.
    """
    user_id = int(current_user["id"])
    return UnreadCountResponse(unread_count=notification_service.unread_count(user_id))


@router.post("/{notification_id}/read", response_model=SimpleMessageResponse)
def mark_one_read(
    notification_id: int = Path(..., ge=1),
    current_user: Dict[str, Any] = Depends(require_user),
) -> SimpleMessageResponse:
    """Mark a single notification read. 404 if it doesn't belong to the user."""
    user_id = int(current_user["id"])
    ok = notification_service.mark_read(user_id, notification_id)
    if not ok:
        # Either id doesn't exist, doesn't belong to this user, or was
        # already read -- 404 covers all three without leaking which.
        raise HTTPException(status_code=404, detail="Notification not found.")
    return SimpleMessageResponse(message="Marked as read.")


@router.post("/read-all", response_model=SimpleMessageResponse)
def mark_all_read_route(
    current_user: Dict[str, Any] = Depends(require_user),
) -> SimpleMessageResponse:
    user_id = int(current_user["id"])
    count = notification_service.mark_all_read(user_id)
    return SimpleMessageResponse(message=f"Marked {count} notification(s) as read.")


# ──────────────────────────────────────────────────────────────────
#  Preferences
# ──────────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=NotificationPreferencesResponse)
def get_prefs_route(
    current_user: Dict[str, Any] = Depends(require_user),
) -> NotificationPreferencesResponse:
    user_id = int(current_user["id"])
    return NotificationPreferencesResponse(**notification_service.get_preferences(user_id))


@router.put("/preferences", response_model=NotificationPreferencesResponse)
def put_prefs_route(
    payload: NotificationPreferencesPayload,
    current_user: Dict[str, Any] = Depends(require_user),
) -> NotificationPreferencesResponse:
    user_id = int(current_user["id"])
    # Drop None values so set_preferences keeps existing toggles for
    # any field the client omitted.
    incoming = {
        k: v for k, v in payload.model_dump().items() if v is not None
    }
    merged = notification_service.set_preferences(user_id, incoming)
    return NotificationPreferencesResponse(**merged)
