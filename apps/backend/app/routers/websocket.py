import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.websocket import manager

logger = logging.getLogger("matchgrid.websocket")

router = APIRouter(tags=["websocket"])

_ROOM_RE = re.compile(r"^(?:[0-9a-fA-F]{24}|global)$")


def origin_allowed(origin: Optional[str]) -> bool:
    """CORS does not apply to WebSockets, so the handshake's Origin is checked here. Outside
    production anything goes (local dev, tests). In production a browser's Origin must be one of
    CORS_ORIGINS; a client that sends no Origin at all is not a browser and cannot be driven by
    another website, so it is let through (health probes, the smoke script)."""
    settings = get_settings()
    if settings.environment != "production" or origin is None:
        return True
    return origin.rstrip("/") in {o.rstrip("/") for o in settings.cors_origin_list}


@router.websocket("/ws/live")
async def websocket_live_endpoint(
    websocket: WebSocket,
    tournament_id: Optional[str] = Query(default=None),
) -> None:
    """Public read-only WebSocket endpoint for live tournament notifications.
    Pushes lightweight invalidation messages (e.g. match_updated, match_event_added).
    
    Query Params:
      - tournament_id: Optional tournament to subscribe to. If omitted, joins the 'global' (hub)
        room, which only receives hub-level events such as match_status_changed — never another
        tournament's goals/events.
    
    Client Message Protocol:
      - Text 'ping': responds with 'pong'.
      - JSON {"action": "subscribe", "tournament_id": "<id>"}: joins that tournament's room.
      - JSON {"action": "unsubscribe", "tournament_id": "<id>"}: leaves that tournament's room.
    """
    if not origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=1008)  # policy violation: handshake from a site we do not serve
        return
    if tournament_id is not None and not _ROOM_RE.match(tournament_id):
        await websocket.close(code=1008)  # policy violation: not a valid room id
        return
    await manager.connect(websocket, tournament_id=tournament_id)
    try:
        while True:
            # Reads keep connection open and detect client disconnects; handles ping and room actions
            text = await websocket.receive_text()
            if text == "ping":
                await websocket.send_text("pong")
                continue

            try:
                data = json.loads(text)
                action = data.get("action")
                tid = data.get("tournament_id")
                if tid is not None and not _ROOM_RE.match(str(tid)):
                    continue
                if action == "subscribe" and tid:
                    await manager.subscribe_room(websocket, str(tid))
                elif action == "unsubscribe" and tid:
                    await manager.unsubscribe_room(websocket, str(tid))
            except (json.JSONDecodeError, AttributeError):
                # Ignore non-protocol frames
                pass
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as exc:
        logger.debug(f"WebSocket closed: {exc}")
        await manager.disconnect(websocket)
