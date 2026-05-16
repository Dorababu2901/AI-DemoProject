"""Public FastAPI router for the Research Digest Agent."""
from __future__ import annotations

import logging

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.api.deps import CurrentUser

from .schemas import ResearchRequest
from .services.agent_loop import run_agent
from .services.streaming import stream_agent_events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "feature": "research-digest-agent"}


@router.post("/digest")
async def stream_digest(
    payload: ResearchRequest, user: CurrentUser
) -> EventSourceResponse:
    """Run the agent and stream ``AgentEvent`` chunks via SSE.

    The browser should consume this with ``fetch`` + a ``ReadableStream``
    reader (or ``EventSource``) and dispatch on the ``event:`` field.
    """
    return EventSourceResponse(stream_agent_events(run_agent(payload)))


def initialize() -> None:
    return None
