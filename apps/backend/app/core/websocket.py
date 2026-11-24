import asyncio
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("dcl.websocket")


class ConnectionManager:
    """Room-partitioned WebSocket connection registry and broadcaster.
    
    Maintains active connections segregated by room (tournament_id or 'global').
    Supports thread-safe room subscription, unsubscription, targeted broadcasts,
    and automatic cleanup of broken sockets.
    """

    def __init__(self) -> None:
        # room_name -> set of WebSockets
        self._rooms: dict[str, set[WebSocket]] = {}
        # websocket -> set of room_names (for O(1) disconnect cleanup)
        self._client_rooms: dict[WebSocket, set[str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, tournament_id: Any = None) -> None:
        """Accepts a WebSocket and joins the requested tournament room (or 'global')."""
        await websocket.accept()
        room = str(tournament_id).strip() if tournament_id else "global"
        async with self._lock:
            self._add_to_room(websocket, room)
        logger.info(f"WebSocket client connected to room '{room}'. Total in room: {len(self._rooms.get(room, set()))}")

    async def disconnect(self, websocket: WebSocket) -> None:
        """Removes a WebSocket from all rooms it joined."""
        async with self._lock:
            rooms = self._client_rooms.pop(websocket, set())
            for room in rooms:
                if room in self._rooms:
                    self._rooms[room].discard(websocket)
                    if not self._rooms[room]:
                        del self._rooms[room]
        logger.info(f"WebSocket client disconnected from {len(rooms)} room(s).")

    async def subscribe_room(self, websocket: WebSocket, room: str) -> None:
        """Dynamically joins a room in an existing connection."""
        clean_room = str(room).strip()
        if not clean_room:
            return
        async with self._lock:
            self._add_to_room(websocket, clean_room)
        logger.debug(f"WebSocket dynamically subscribed to room '{clean_room}'.")

    async def unsubscribe_room(self, websocket: WebSocket, room: str) -> None:
        """Dynamically leaves a room in an existing connection."""
        clean_room = str(room).strip()
        if not clean_room:
            return
        async with self._lock:
            if clean_room in self._rooms:
                self._rooms[clean_room].discard(websocket)
                if not self._rooms[clean_room]:
                    del self._rooms[clean_room]
            if websocket in self._client_rooms:
                self._client_rooms[websocket].discard(clean_room)
        logger.debug(f"WebSocket unsubscribed from room '{clean_room}'.")

    def _add_to_room(self, websocket: WebSocket, room: str) -> None:
        if room not in self._rooms:
            self._rooms[room] = set()
        self._rooms[room].add(websocket)
        if websocket not in self._client_rooms:
            self._client_rooms[websocket] = set()
        self._client_rooms[websocket].add(room)

    async def broadcast_to_tournament(
        self, tournament_id: Any, message: dict[str, Any]
    ) -> None:
        """Broadcasts a message strictly to the specified tournament room and echoes to 'global'."""
        tid_str = str(tournament_id).strip()
        if "tournament_id" not in message:
            message["tournament_id"] = tid_str

        async with self._lock:
            target_conns = set(self._rooms.get(tid_str, set()))
            global_conns = set(self._rooms.get("global", set()))
            all_conns = list(target_conns | global_conns)

        await self._send_to_sockets(all_conns, message)

    async def broadcast(
        self, message: dict[str, Any], tournament_id: Any = None
    ) -> None:
        """General broadcaster: routes to tournament room if tournament_id is provided, else broadcasts to all."""
        tid = tournament_id or message.get("tournament_id")
        if tid:
            await self.broadcast_to_tournament(tid, message)
        else:
            async with self._lock:
                all_conns = list(self._client_rooms.keys())
            await self._send_to_sockets(all_conns, message)

    async def _send_to_sockets(self, connections: list[WebSocket], message: dict[str, Any]) -> None:
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
            for conn in disconnected:
                await self.disconnect(conn)

    @property
    def active_count(self) -> int:
        return len(self._client_rooms)

    def room_count(self, room: str) -> int:
        return len(self._rooms.get(room, set()))


manager = ConnectionManager()


async def broadcast(message: dict[str, Any], tournament_id: Any = None) -> None:
    await manager.broadcast(message, tournament_id=tournament_id)


async def broadcast_to_tournament(tournament_id: Any, message: dict[str, Any]) -> None:
    await manager.broadcast_to_tournament(tournament_id, message)
