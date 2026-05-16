"""SSE streaming helpers for the research agent.

The wire format is the standard Server-Sent Events line protocol:

    event: <event.type>
    data: <event.json()>
    \n

`stream_agent_events` adapts an ``AgentEvent`` async iterator into the
``dict``-shaped chunks expected by ``sse_starlette.EventSourceResponse``.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from ..schemas import AgentEvent

logger = logging.getLogger(__name__)


async def stream_agent_events(
    events: AsyncIterator[AgentEvent],
) -> AsyncIterator[dict]:
    """Adapt an AgentEvent stream into ``EventSourceResponse`` dict chunks."""
    try:
        async for ev in events:
            yield {
                "event": ev.type,
                "data": ev.model_dump_json(),
            }
    except Exception as exc:  # noqa: BLE001
        logger.exception("agent stream failed")
        # Best-effort error event so the client sees *something*.
        err = AgentEvent(type="error", data=f"{type(exc).__name__}: {exc}")
        yield {"event": "error", "data": err.model_dump_json()}
