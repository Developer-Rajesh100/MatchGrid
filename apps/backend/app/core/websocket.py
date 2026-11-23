import asyncio
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("dcl.websocket")


class ConnectionManager:
    """In-process WebSocket connection registry and broadcaster.
    Keeps a set of active connections, broadcasts notifications, and automatically
    prunes disconnected clients."""

    def __init__(self) -> None:
        self._active_connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self._active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total active: {len(self._active_connections)}")

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast a message to all active clients.
        If a connection fails or is broken, it is safely pruned."""
        async with self._lock:
            connections = list(self._active_connections)

        if not connections:
            return

        disconnected: list[WebSocket] = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except (WebSocketDisconnect, RuntimeError, ConnectionResetError) as e:
                logger.debug(f"Client disconnected during send: {e}")
                disconnected.append(connection)
            except Exception as e:
                logger.warning(f"Unexpected error broadcasting to client: {e}")
                disconnected.append(connection)

        if disconnected:
            async with self._lock:
                for conn in disconnected:
                    self._active_connections.discard(conn)
            logger.info(
                f"Pruned {len(disconnected)} disconnected WebSocket clients. Total active: {len(self._active_connections)}"
            )

    @property
    def active_count(self) -> int:
        return len(self._active_connections)


manager = ConnectionManager()


async def broadcast(message: dict[str, Any]) -> None:
    await manager.broadcast(message)
