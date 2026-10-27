"""python -m vision: run the vision service."""

import logging

import uvicorn

from vision.config import Settings


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # httpx logs every request at INFO: two lines a second from the publisher. Failures still show.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    # Local only: the service pushes readings out and needs no inbound traffic except /status.
    uvicorn.run("vision.service:app", host="127.0.0.1", port=Settings().port)


if __name__ == "__main__":
    main()
