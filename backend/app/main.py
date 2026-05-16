from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_router
from app.api import attachments as attachments_router
from app.api import chat as chat_router
from app.api import images as images_router
from app.api import threads as threads_router
from app.core.config import get_settings
from app.sqlfeature.api import router as sql_router, initialize as initialize_sqlfeature
from app.sheetsfeature.api import (
    router as sheets_router,
    initialize as initialize_sheetsfeature,
)
from app.researchfeature.api import (
    router as research_router,
    initialize as initialize_researchfeature,
)
from app.tictactoefeature.api import (
    router as tictactoe_router,
    initialize as initialize_tictactoefeature,
)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix=settings.api_v1_prefix)
app.include_router(chat_router.router, prefix=settings.api_v1_prefix)
app.include_router(threads_router.router, prefix=settings.api_v1_prefix)
app.include_router(images_router.router, prefix=settings.api_v1_prefix)
app.include_router(attachments_router.router, prefix=settings.api_v1_prefix)
app.include_router(sql_router, prefix=settings.api_v1_prefix)
app.include_router(sheets_router, prefix=settings.api_v1_prefix)
app.include_router(research_router, prefix=settings.api_v1_prefix)
app.include_router(tictactoe_router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def _on_startup() -> None:
    initialize_sqlfeature()
    initialize_sheetsfeature()
    initialize_researchfeature()
    initialize_tictactoefeature()


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
