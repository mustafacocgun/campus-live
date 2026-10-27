"""The vision service: one worker per camera plus the publisher. /health and /status are for debugging."""

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from vision.cameras import CameraConfig, load_cameras
from vision.config import Settings
from vision.publisher import Publisher
from vision.replay import ReplayWorker, load_dataset
from vision.simulated import SimulatedWorker
from vision.worker_base import WorkerBase

logger = logging.getLogger(__name__)


def build_workers(settings: Settings, cameras: list[CameraConfig]) -> list[WorkerBase]:
    if settings.detector == "simulated":
        return [SimulatedWorker(camera, seed=index) for index, camera in enumerate(cameras)]
    if settings.detector == "replay":
        # A missing or bad dataset stops startup: it is a local file, checked at rehearsal.
        tracks = load_dataset(settings.replay_file, cameras)
        replayed: list[WorkerBase] = []
        for index, camera in enumerate(cameras):
            if camera.id not in tracks:
                logger.warning("no recorded readings: camera %s stays simulated", camera.id)
                replayed.append(SimulatedWorker(camera, seed=index))
                continue
            replayed.append(ReplayWorker(camera, tracks[camera.id]))
        return replayed
    # Imported only in yolo mode, so simulated mode never loads OpenCV or supervision.
    from vision.analyzers.crowd import CrowdAnalyzer
    from vision.detector import PERSON, YoloDetector
    from vision.worker import CameraWorker

    workers: list[WorkerBase] = []
    for index, camera in enumerate(cameras):
        if camera.kind != "crowd":
            logger.warning("no %s analyzer yet: camera %s stays simulated", camera.kind, camera.id)
            workers.append(SimulatedWorker(camera, seed=index))
            continue
        workers.append(CameraWorker(camera, lambda: YoloDetector(PERSON), CrowdAnalyzer(camera)))
    return workers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings()
    workers = build_workers(settings, load_cameras(settings.cameras_file))
    for worker in workers:
        worker.start()
    stop = threading.Event()
    publisher = Publisher(settings.api_url, settings.ingest_token, workers)
    threading.Thread(target=publisher.run, args=(settings.publish_interval_s, stop), daemon=True).start()
    app.state.settings = settings
    app.state.workers = workers
    yield
    stop.set()
    for worker in workers:
        worker.stop()


app = FastAPI(title="Campus Live vision", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/status")
def status() -> dict[str, Any]:
    return {
        "detector": app.state.settings.detector,
        "cameras": [worker.status() for worker in app.state.workers],
    }
