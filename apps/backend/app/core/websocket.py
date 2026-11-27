import asyncio
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("matchgrid.websocket")

# One stalled client must never delay a broadcast (or the HTTP request that triggered it).
SEND_TIMEOUT_SECONDS = 2.0
# Cap on rooms one socket may join, so a client cannot grow server memory unboundedly.
MAX_ROOMS_PER_CLIENT = 25

# Message types that are also useful to hub-level ("global" room) listeners such as the
# public tournament directory (live-match counts) and the role dashboards' match lists.
HUB_MESSAGE_TYPES = frozenset({"match_status_changed"})


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
            if (
                clean_room not in self._client_rooms.get(websocket, set())
                and len(self._client_rooms.get(websocket, set())) >= MAX_ROOMS_PER_CLIENT
            ):
                return
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
        self, tournament_id: Any, message: dict[str, Any], include_global: bool = False
    ) -> None:
        """Broadcasts strictly to the tournament's room. Hub-level ("global") listeners only
        receive it when `include_global` is set."""
        tid_str = str(tournament_id).strip()
        if "tournament_id" not in message:
            message["tournament_id"] = tid_str

        async with self._lock:
            targets = set(self._rooms.get(tid_str, set()))
            if include_global:
                targets |= self._rooms.get("global", set())

        await self._send_to_sockets(list(targets), message)

    async def broadcast(
        self, message: dict[str, Any], tournament_id: Any = None, include_global: bool | None = None
    ) -> None:
        """Routes to the tournament room when a tournament id is known, else to everyone.
        Status changes are mirrored to the global room by default (see HUB_MESSAGE_TYPES)."""
        tid = tournament_id or message.get("tournament_id")
        if tid:
            if include_global is None:
                include_global = message.get("type") in HUB_MESSAGE_TYPES
            await self.broadcast_to_tournament(tid, message, include_global=include_global)
        else:
            async with self._lock:
                all_conns = list(self._client_rooms.keys())
            await self._send_to_sockets(all_conns, message)

    async def _send_one(self, connection: WebSocket, message: dict[str, Any]) -> bool:
        try:
            await asyncio.wait_for(connection.send_json(message), timeout=SEND_TIMEOUT_SECONDS)
            return True
        except asyncio.TimeoutError:
            logger.warning("Dropping WebSocket client: send timed out")
        except (WebSocketDisconnect, RuntimeError, ConnectionResetError) as e:
            logger.debug(f"Client disconnected during send: {e}")
        except Exception as e:
            logger.warning(f"Unexpected error broadcasting to client: {e}")
        return False

    async def _send_to_sockets(self, connections: list[WebSocket], message: dict[str, Any]) -> None:
        """Sends to all sockets concurrently; slow or broken ones are dropped."""
        if not connections:
            return
        results = await asyncio.gather(*(self._send_one(c, message) for c in connections))
        for connection, ok in zip(connections, results):
            if not ok:
                await self.disconnect(connection)

    @property
    def active_count(self) -> int:
        return len(self._client_rooms)

    def room_count(self, room: str) -> int:
        return len(self._rooms.get(room, set()))


manager = ConnectionManager()


async def broadcast(
    message: dict[str, Any], tournament_id: Any = None, include_global: bool | None = None
) -> None:
    await manager.broadcast(message, tournament_id=tournament_id, include_global=include_global)


async def broadcast_to_tournament(
    tournament_id: Any, message: dict[str, Any], include_global: bool = False
) -> None:
    await manager.broadcast_to_tournament(tournament_id, message, include_global=include_global)
