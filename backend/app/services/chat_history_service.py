"""
Persist chat conversations per user (MySQL).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from app.db import mysql_db

logger = logging.getLogger(__name__)


def title_from_query(query: str) -> str:
    t = query.strip().replace("\n", " ")
    if not t:
        return "New chat"
    return (t[:80] + "…") if len(t) > 80 else t


def create_session(user_id: int, title: str) -> int:
    q = """
    INSERT INTO chat_sessions (user_id, title)
    VALUES (%s, %s)
    """
    return mysql_db.execute_insert(q, (user_id, title[:255]))


def session_belongs_to_user(session_id: int, user_id: int) -> bool:
    row = mysql_db.fetch_one(
        "SELECT id FROM chat_sessions WHERE id = %s AND user_id = %s LIMIT 1",
        (session_id, user_id),
    )
    return row is not None


def resolve_session_id(
    user_id: int,
    session_id: Optional[int],
    query: str,
) -> tuple[Optional[int], Optional[str]]:
    """
    Return (session_id, error). On error, session_id is None.
    """
    if session_id is not None:
        if not session_belongs_to_user(session_id, user_id):
            return None, "Chat not found for this account."
        return session_id, None
    sid = create_session(user_id, title_from_query(query))
    return sid, None


def append_exchange(
    session_id: int,
    user_text: str,
    assistant_text: str,
    confidence: int,
    citations: List[str],
) -> None:
    conn = mysql_db.get_connection()
    try:
        cit_json = json.dumps(citations) if citations else None
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, confidence, citations)
                VALUES (%s, 'user', %s, NULL, NULL)
                """,
                (session_id, user_text),
            )
            cur.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, confidence, citations)
                VALUES (%s, 'assistant', %s, %s, %s)
                """,
                (session_id, assistant_text, confidence, cit_json),
            )
            cur.execute(
                """
                UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = %s
                """,
                (session_id,),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("Failed to save chat messages for session %s", session_id)
        raise
    finally:
        conn.close()


def list_sessions_for_user(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    rows = mysql_db.fetch_all(
        """
        SELECT id, title, created_at, updated_at
        FROM chat_sessions
        WHERE user_id = %s
        ORDER BY updated_at DESC
        LIMIT %s
        """,
        (user_id, limit),
    )
    return rows


def get_session_messages(user_id: int, session_id: int) -> Optional[Dict[str, Any]]:
    meta = mysql_db.fetch_one(
        """
        SELECT id, title, created_at, updated_at
        FROM chat_sessions
        WHERE id = %s AND user_id = %s
        LIMIT 1
        """,
        (session_id, user_id),
    )
    if not meta:
        return None
    rows = mysql_db.fetch_all(
        """
        SELECT id, role, content, confidence, citations, created_at
        FROM chat_messages
        WHERE session_id = %s
        ORDER BY id ASC
        """,
        (session_id,),
    )
    messages: List[Dict[str, Any]] = []
    for r in rows:
        cit = r.get("citations")
        if isinstance(cit, str):
            try:
                cit = json.loads(cit)
            except json.JSONDecodeError:
                cit = []
        elif cit is None:
            cit = []
        messages.append(
            {
                "id": int(r["id"]),
                "role": r["role"],
                "content": str(r["content"]),
                "confidence": int(r["confidence"]) if r.get("confidence") is not None else None,
                "citations": cit if isinstance(cit, list) else [],
            }
        )
    return {
        "session_id": int(meta["id"]),
        "title": str(meta["title"]),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
        "messages": messages,
    }


def delete_session(user_id: int, session_id: int) -> bool:
    row = mysql_db.fetch_one(
        "SELECT id FROM chat_sessions WHERE id = %s AND user_id = %s LIMIT 1",
        (session_id, user_id),
    )
    if not row:
        return False
    conn = mysql_db.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM chat_sessions WHERE id = %s AND user_id = %s", (session_id, user_id))
        conn.commit()
        return True
    finally:
        conn.close()
