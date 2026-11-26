"""The container must run exactly one uvicorn worker.

WebSocket rooms and the login throttle live in process memory (app/core/websocket.py,
app/core/rate_limit.py). uvicorn starts $WEB_CONCURRENCY workers when that variable is set and
--workers is not, which on a platform that sets it splits rooms and throttles across processes:
found in production by the live audit (erratic 429s), so the entrypoint pins the count.
"""

import re
from pathlib import Path

ENTRYPOINT = Path(__file__).resolve().parent.parent / "docker-entrypoint.sh"


def test_entrypoint_pins_a_single_uvicorn_worker():
    exec_lines = [l for l in ENTRYPOINT.read_text().splitlines() if l.strip().startswith("exec uvicorn")]
    assert len(exec_lines) == 1
    assert re.search(r"--workers\s+1\b", exec_lines[0]), exec_lines[0]
    # Never trust forwarded headers wholesale: the app resolves the client IP itself.
    assert "--proxy-headers" not in exec_lines[0] and "--forwarded-allow-ips" not in exec_lines[0]
