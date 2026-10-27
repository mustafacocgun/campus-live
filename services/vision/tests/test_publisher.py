import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from conftest import NOW
from vision.contracts import CameraReading
from vision.publisher import Publisher

READING = CameraReading(
    camera_id="kafe-merkez", kind="crowd", count=3, level="medium", source="simulated", measured_at=NOW
)


@pytest.fixture
def api():
    """A stand-in API that records every request and answers 202."""
    received: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802 (http.server's naming)
            body = self.rfile.read(int(self.headers["Content-Length"]))
            received.append(
                {"path": self.path, "auth": self.headers["Authorization"], "body": json.loads(body)}
            )
            self.send_response(202)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield SimpleNamespace(url=f"http://127.0.0.1:{server.server_port}", received=received)
    server.shutdown()


def _worker(reading):
    return SimpleNamespace(latest=lambda now: reading)


def test_publisher_sends_batch_with_token(api) -> None:
    publisher = Publisher(api.url, "test-token-1234567890", [_worker(READING)])
    assert publisher.publish_once(NOW) is True
    [request] = api.received
    assert request["path"] == "/internal/readings"
    assert request["auth"] == "Bearer test-token-1234567890"
    assert request["body"] == {"readings": [READING.to_json()]}


def test_publisher_survives_api_down() -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        closed_port = probe.getsockname()[1]
    publisher = Publisher(f"http://127.0.0.1:{closed_port}", "test-token-1234567890", [_worker(READING)])
    assert publisher.publish_once(NOW) is False


def test_publisher_skips_when_nothing_new(api) -> None:
    publisher = Publisher(api.url, "test-token-1234567890", [_worker(READING), _worker(None)])
    publisher.publish_once(NOW)
    publisher.publish_once(NOW)
    assert len(api.received) == 1
