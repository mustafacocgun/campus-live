"""python -m vision: run the vision service."""

import logging

import uvicorn

from vision.config import Settings


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # httpx logs every request at INFO: two lines a second from the publisher. Failures still show.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    # Local by default: the service pushes readings out and needs no inbound traffic except /status,
    # and the stage preview when the API runs on another PC (VISION_HOST, D33).
    settings = Settings()
    uvicorn.run("vision.service:app", host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
