import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.websocket import manager

logger = logging.getLogger("dcl.websocket")

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket) -> None:
    """Public read-only WebSocket endpoint for live tournament notifications.
    Pushes lightweight invalidation messages (e.g. match_updated, match_event_added)."""
    await manager.connect(websocket)
    try:
        while True:
            # Reads keep connection open and detect client disconnects; handles optional ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as exc:
        logger.debug(f"WebSocket closed: {exc}")
        await manager.disconnect(websocket)
