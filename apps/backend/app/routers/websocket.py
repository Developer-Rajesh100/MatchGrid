import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.websocket import manager

logger = logging.getLogger("dcl.websocket")

router = APIRouter(tags=["websocket"])

_ROOM_RE = re.compile(r"^(?:[0-9a-fA-F]{24}|global)$")


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
