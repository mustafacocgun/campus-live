"""The vision service: one worker per camera with footage, plus the publisher. /health and /status
are for debugging."""

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import partial
from typing import Any

from fastapi import FastAPI

from vision.analyzers.crowd import CrowdAnalyzer, FeetProjector
from vision.analyzers.parking import ParkingAnalyzer
from vision.analyzers.traffic import TrafficAnalyzer
from vision.calibration import WILDTRACK_FRAME, CalibratedProjection, MapAnchor, load_wildtrack_calibration
from vision.cameras import CameraConfig, load_cameras
from vision.config import Settings
from vision.contracts import Camera
from vision.detector import PARKED, PERSON, VEHICLES, TestBoxesDetector, YoloDetector
from vision.projection import CameraPose, PoseProjector
from vision.publisher import Publisher
from vision.registry import load_registry
from vision.worker import CameraWorker

logger = logging.getLogger(__name__)


def projector_for(camera: CameraConfig, registered: Camera) -> FeetProjector:
    """Where this camera's people stand: its footage's own calibration, else the registry's pose."""
    if camera.wildtrack:
        calibration = camera.wildtrack
        K, dist, rvec, tvec = load_wildtrack_calibration(
            calibration.dataset_dir, calibration.camera, calibration.intrinsics
        )
        anchor = MapAnchor(calibration.anchor.lat, calibration.anchor.lng, calibration.anchor.rotation_deg)
        return CalibratedProjection(
            K, dist, rvec, tvec, calibration.world_unit_m, anchor, frame_size=WILDTRACK_FRAME
        )
    pose = CameraPose(
        registered.latitude, registered.longitude, registered.heading, registered.fov_deg, registered.range_m
    )
    return PoseProjector(pose)


# What each kind of camera looks for (COCO classes).
CLASSES = {"crowd": PERSON, "parking": PARKED, "traffic": VEHICLES}
# YOLO's input size where the default (640 px) is too small: parked cars far away are a few pixels (#50).
IMAGE_SIZE = {"parking": 1280}


def make_analyzer(camera: CameraConfig, registered: Camera) -> CrowdAnalyzer | ParkingAnalyzer:
    """The analyzer for this camera's kind; indoor crowd cameras count without positions."""
    if camera.kind == "parking":
        return ParkingAnalyzer(camera)
    if camera.kind == "traffic":
        return TrafficAnalyzer(camera)
    return CrowdAnalyzer(camera, None if registered.indoor else projector_for(camera, registered))


def build_workers(
    settings: Settings, cameras: list[CameraConfig], registry: dict[str, Camera]
) -> list[CameraWorker]:
    for camera in cameras:
        registered = registry.get(camera.id)
        if registered is None or registered.kind != camera.kind:
            raise ValueError(f"camera {camera.id} ({camera.kind}) is not in config/cameras.json")
    source_kind = "simulated" if settings.detector == "test-boxes" else "demo-footage"
    detector_class = TestBoxesDetector if settings.detector == "test-boxes" else YoloDetector
    workers = []
    for camera in cameras:
        if camera.source is None:
            logger.info("camera %s has no footage: it stays grey on the map", camera.id)
            continue
        detector = partial(detector_class, CLASSES[camera.kind], imgsz=IMAGE_SIZE.get(camera.kind))
        analyzer = partial(make_analyzer, camera, registry[camera.id])
        workers.append(CameraWorker(camera, detector, analyzer, source_kind=source_kind))
    return workers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings()
    workers = build_workers(settings, load_cameras(settings.cameras_file), load_registry())
    if not workers:
        logger.warning("no camera has footage (%s): nothing to count", settings.cameras_file)
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


app = FastAPI(title="Campus Live vision", version="0.2.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/status")
def status() -> dict[str, Any]:
    return {
        "detector": app.state.settings.detector,
        "cameras": [worker.status() for worker in app.state.workers],
    }
