"""
Pydantic models for request/response validation
"""

import re

from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Literal
from datetime import datetime


# ── Shared validators ────────────────────────────────────────────────────────

# International-friendly phone format: optional leading +, then 6–18 digits.
# Accepts spaces, dashes, dots, parentheses as separators (we strip them).
_PHONE_DIGITS_RE = re.compile(r"^\+?\d{6,18}$")
# Password must be 8+ chars and contain at least one letter and one digit.
_PASSWORD_LETTER_RE = re.compile(r"[A-Za-z]")
_PASSWORD_DIGIT_RE = re.compile(r"\d")


def _normalize_phone(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Phone must be a string.")
    cleaned = re.sub(r"[\s\-\.\(\)]+", "", value.strip())
    if not _PHONE_DIGITS_RE.match(cleaned):
        raise ValueError(
            "Phone must be 6–18 digits, optionally starting with '+'. "
            "Spaces, dashes, dots and parentheses are allowed."
        )
    return cleaned


def _validate_strong_password(value: str) -> str:
    if not isinstance(value, str) or len(value) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if len(value) > 256:
        raise ValueError("Password is too long (max 256 characters).")
    if not _PASSWORD_LETTER_RE.search(value):
        raise ValueError("Password must contain at least one letter.")
    if not _PASSWORD_DIGIT_RE.search(value):
        raise ValueError("Password must contain at least one digit.")
    return value


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    message: str
    timestamp: str


class DocumentUploadResponse(BaseModel):
    """Response after document upload"""
    document_id: str
    filename: str
    total_chunks: int
    status: str = "success"
    message: str


class ChatRequest(BaseModel):
    """Request for chat query"""
    query: str = Field(..., description="User query")
    mode: Literal["deterministic", "exploratory"] = Field(
        default="deterministic",
        description="AI mode: deterministic or exploratory"
    )
    user_role: Literal["student", "teacher"] = Field(
        default="student",
        description="User role"
    )
    user_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Signed-in user id — when set, the exchange is saved to chat history",
    )
    session_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Existing chat session to continue; requires user_id",
    )
    model: Optional[str] = Field(
        default=None,
        max_length=64,
        description=(
            "Public model id from /api/models (e.g. 'gpt-5', 'opus-4-7'). "
            "Omit to use the server's DEFAULT_MODEL. The backend rejects "
            "models the user's tier doesn't allow."
        ),
    )


class ModelInfoResponse(BaseModel):
    """One row in the model picker."""

    id: str
    label: str
    provider: Literal["openai", "anthropic", "google"]
    min_tier: Literal["free", "regular", "advanced"]
    speed_label: str
    description: str
    available: bool


class ModelsResponse(BaseModel):
    """Response of GET /api/models — what the picker should display."""

    models: List[ModelInfoResponse]
    default: Optional[str] = Field(
        default=None,
        description="Pre-selected model id (server-recommended starting point).",
    )
    tier: str


class Citation(BaseModel):
    """Citation information"""
    source: str
    page: Optional[int] = None
    chunk_id: str
    relevance_score: float


class ChatResponse(BaseModel):
    """Response for chat query"""
    answer: str
    confidence: int = Field(..., ge=0, le=100, description="Confidence score 0-100")
    citations: List[str]
    mode: str
    retrieved_chunks: int = Field(default=0, description="Number of chunks retrieved")
    metadata: Optional[dict] = None
    session_id: Optional[int] = Field(
        default=None,
        description="MySQL chat session id when the message was saved",
    )


class ChatSessionSummary(BaseModel):
    """One row in the saved-chats list."""

    id: int
    title: str
    updated_at: Optional[datetime] = None


class ChatHistoryMessage(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    confidence: Optional[int] = None
    citations: List[str] = Field(default_factory=list)


class ChatSessionDetailResponse(BaseModel):
    session_id: int
    title: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    messages: List[ChatHistoryMessage]


class DocumentChunk(BaseModel):
    """Document chunk stored in MongoDB"""
    document_id: str
    filename: str
    chunk_index: int
    content: str
    embedding: List[float]
    metadata: dict
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Users / auth ─────────────────────────────────────────────────────────────

class UserRegisterRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=5, max_length=32)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=256)
    turnstile_token: Optional[str] = Field(
        default=None,
        max_length=4096,
        description="Cloudflare Turnstile challenge token from the signup form.",
    )

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str) -> str:
        return _normalize_phone(v)

    @field_validator("password")
    @classmethod
    def _check_password_strength(cls, v: str) -> str:
        return _validate_strong_password(v)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


class GoogleSignInRequest(BaseModel):
    """Credential string from `google.accounts.id` on the frontend (JWT)."""

    credential: str = Field(..., min_length=10, max_length=16384)


class FacebookSignInRequest(BaseModel):
    """Short-lived user access token from the Facebook JS SDK login response."""

    access_token: str = Field(..., min_length=10, max_length=4096)


class MicrosoftSignInRequest(BaseModel):
    """ID token (JWT) returned by MSAL.js after a successful loginPopup."""

    id_token: str = Field(..., min_length=10, max_length=16384)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=256)

    @field_validator("new_password")
    @classmethod
    def _check_password_strength(cls, v: str) -> str:
        return _validate_strong_password(v)


class SimpleMessageResponse(BaseModel):
    message: str


class UserPublic(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str
    created_at: Optional[datetime] = None
    subscription_tier: str = "free"
    theme: Literal["light", "dark"] = "light"

    model_config = {"from_attributes": True}


class AuthSuccessResponse(BaseModel):
    message: str = "ok"
    user: UserPublic
    token: str = Field(..., description="Bearer token to send on every protected request.")
    expires_at: datetime


class RegisterResponse(BaseModel):
    message: str
    user: UserPublic
    token: str = Field(..., description="Bearer token to send on every protected request.")
    expires_at: datetime


class UserProfileResponse(BaseModel):
    """Full profile for the account page (includes optional picture + daily usage)."""

    id: int
    email: str
    first_name: str
    last_name: str
    phone: str
    created_at: Optional[datetime] = None
    profile_picture_url: Optional[str] = None
    daily_time_seconds: int = 0
    subscription_tier: str = "free"
    has_stripe_customer: bool = False
    theme: Literal["light", "dark"] = "light"

    model_config = {"from_attributes": True}


class UserProfilePatchRequest(BaseModel):
    """Update profile fields. Send only the fields you want to change."""

    profile_picture_url: Optional[str] = None
    theme: Optional[Literal["light", "dark"]] = None


class UsageSecondsRequest(BaseModel):
    seconds: int = Field(..., ge=1, le=600, description="Seconds to add to today's total")


class QuotaCounter(BaseModel):
    """Single action's quota status for the current calendar month."""

    used: int = Field(..., ge=0, description="Calls already counted this month.")
    limit: Optional[int] = Field(
        default=None,
        description="Monthly cap, or null for unlimited (advanced tier).",
    )


class UsageQuotaResponse(BaseModel):
    """Snapshot of the signed-in user's chat/upload/voice usage for this month."""

    tier: str
    period_start: str = Field(
        ...,
        description="First day of the current quota window (YYYY-MM-DD).",
    )
    chat: QuotaCounter
    upload: QuotaCounter
    voice: QuotaCounter


# ── Admin dashboard ───────────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


class AdminLoginResponse(BaseModel):
    token: str
    expires_at: datetime


class AdminTotals(BaseModel):
    total_users: int
    users_today: int
    users_last_7_days: int
    users_last_30_days: int
    total_chat_sessions: int
    total_chat_messages: int
    active_users_today: int
    total_seconds_today: int


class AdminSignupTrendPoint(BaseModel):
    day: str
    count: int


class AdminCountryCount(BaseModel):
    country: str
    country_code: str
    count: int


class AdminRecentUser(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    country: Optional[str] = None
    city: Optional[str] = None
    created_at: Optional[str] = None


class AdminTopUser(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    total_seconds: int


class AdminStatsResponse(BaseModel):
    generated_at: str
    totals: AdminTotals
    signup_trend: List[AdminSignupTrendPoint]
    countries: List[AdminCountryCount]
    recent_users: List[AdminRecentUser]
    top_users: List[AdminTopUser]


class AdminBackfillResponse(BaseModel):
    updated: int


class AdminUserDocument(BaseModel):
    document_id: str
    filename: Optional[str] = None
    original_filename: Optional[str] = None
    doc_type: Optional[str] = None
    total_chunks: int = 0
    file_size_kb: float = 0
    chunked_at: Optional[str] = None


class AdminUserDetail(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str
    country: Optional[str] = None
    country_code: Optional[str] = None
    city: Optional[str] = None
    signup_ip: Optional[str] = None
    created_at: Optional[str] = None
    days_as_user: Optional[int] = None
    total_seconds: int = 0
    active_days: int = 0
    last_active_date: Optional[str] = None
    chat_sessions: int = 0
    chat_messages: int = 0
    document_count: int = 0
    document_types: dict = Field(default_factory=dict)
    total_document_kb: float = 0
    documents: List[AdminUserDocument] = Field(default_factory=list)


class AdminUsersResponse(BaseModel):
    generated_at: str
    users: List[AdminUserDetail]
