"""Application configuration loaded from environment variables.

No secrets are hardcoded here. Values come from a local `.env` file
(see `.env.example`) or the process environment.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = Field(default="Amzur AI Chat")
    app_env: str = Field(default="development")
    debug: bool = Field(default=False)
    api_v1_prefix: str = Field(default="/api/v1")

    # Database
    database_url: str
    async_database_url: str | None = None

    # Auth / JWT
    jwt_secret_key: str
    jwt_algorithm: str = Field(default="HS256")
    jwt_expire_minutes: int = Field(default=60)

    # Auth cookie
    auth_cookie_name: str = Field(default="access_token")
    auth_cookie_secure: bool = Field(default=False)  # set True in prod (HTTPS)
    auth_cookie_samesite: str = Field(default="lax")  # "lax" | "strict" | "none"
    auth_cookie_domain: str | None = None

    # Google OAuth
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/auth/google/callback"
    )
    # Where to send the user after a successful Google sign-in
    frontend_url: str = Field(default="http://localhost:5174")
    # Optional: restrict logins to these email domains (CSV), e.g. "amzur.com"
    allowed_email_domains: str = Field(default="")

    @property
    def allowed_email_domains_list(self) -> list[str]:
        return [
            d.strip().lower()
            for d in self.allowed_email_domains.split(",")
            if d.strip()
        ]

    # LLM Gateway
    litellm_proxy_url: str | None = None
    litellm_api_key: str | None = None
    default_llm_model: str = Field(default="gpt-4o-mini")
    llm_temperature: float = Field(default=0.7)
    llm_max_tokens: int = Field(default=1024)
    llm_system_prompt: str = Field(
        default=(
            "You are Amzur AI Chat, a helpful, concise, and friendly assistant. "
            "Answer clearly and use Markdown when it improves readability."
        )
    )

    # Provider API keys (read by LiteLLM via env vars)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None

    # Vector store / RAG
    vector_store_url: str | None = None
    embedding_model: str = Field(default="text-embedding-3-small")

    # CORS
    cors_origins: str = Field(default="http://localhost:5173")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
