import json
import math
import subprocess
import sys

import yaml

from conftest import VISION_DIR
from vision.cameras import load_cameras

LAT0, LNG0 = 40.742, 30.332


def at(east: float, north: float) -> dict:
    return {"lat": LAT0 + north / 111_320, "lon": LNG0 + east / (111_320 * math.cos(math.radians(LAT0)))}


def ring(*corners: tuple[float, float]) -> list[dict]:
    return [at(*c) for c in (*corners, corners[0])]


def box(x: float, y: float, w: float, h: float) -> list[dict]:
    return ring((x, y), (x + w, y), (x + w, y + h), (x, y + h))


def element(way_id: int, tags: dict, geometry: list[dict]) -> dict:
    return {"type": "way", "id": way_id, "tags": tags, "geometry": geometry}


def campus_osm() -> dict:
    return {
        "elements": [
            element(
                216324005,
                {"amenity": "university", "name": "Sakarya Üniversitesi"},
                box(-200, -200, 400, 400),
            ),
            element(
                1,
                {"building": "university", "name": "Sakarya Üniversitesi Test Fakültesi"},
                box(-50, 20, 60, 40),
            ),
            element(
                2,
                {"building": "yes", "name": "Sakarya Uygulamalı Bilimler Üniversitesi Rektörlüğü"},
                box(100, 100, 30, 30),
            ),
            element(3, {"building": "yes", "name": "Test Öğrenci Yurdu"}, box(-150, 100, 30, 30)),
            element(4, {"building": "service", "name": "Isıtma Merkezi"}, box(-150, -150, 20, 20)),
            element(5, {"amenity": "parking"}, box(-40, -60, 50, 30)),
            element(6, {"amenity": "parking"}, box(120, 60, 30, 20)),  # next to SUBÜ's building
            element(
                7,
                {"highway": "tertiary", "name": "Kampüs İçi Yolu"},
                [at(-150, -100), at(0, -100), at(300, -100)],
            ),
            element(8, {"highway": "residential"}, [at(-100, -150), at(-100, 150)]),
        ]
    }


def build(tmp_path):
    osm = tmp_path / "campus.json"
    osm.write_text(json.dumps(campus_osm()))
    registry = tmp_path / "cameras.json"
    outdoor = {
        "id": "test-onu",
        "name": "Test önü",
        "section": "Fakülteler",
        "kind": "crowd",
        "latitude": at(0, 0)["lat"],
        "longitude": at(0, 0)["lon"],
        "heading": 0,
        "fovDeg": 70,
        "rangeM": 30,
    }
    registry.write_text(json.dumps({"cameras": [outdoor]}))
    example = tmp_path / "example.yaml"
    example.write_text("cameras:\n  - {id: test-onu, kind: crowd, thresholds: {medium: 8, high: 20}}\n")
    places, cameras_out, example_out = (
        tmp_path / "places.json",
        tmp_path / "cameras-out.json",
        tmp_path / "ex.yaml",
    )
    subprocess.run(
        [
            sys.executable,
            "tools/build_campus.py",
            "--osm",
            str(osm),
            "--cameras",
            str(registry),
            "--example",
            str(example),
            "--places-out",
            str(places),
            "--cameras-out",
            str(cameras_out),
            "--example-out",
            str(example_out),
        ],
        cwd=VISION_DIR,
        check=True,
        capture_output=True,
    )
    return json.loads(places.read_text()), json.loads(cameras_out.read_text())["cameras"], example_out


def inside(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(polygon, polygon[1:], strict=False):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def test_places_come_from_the_campus_and_skip_where_cameras_must_not_go(tmp_path) -> None:
    places, _, _ = build(tmp_path)
    names = {place["name"]: place for place in places["places"]}
    assert names["Test Fakültesi"]["kind"] == "building"
    # Not SUBÜ's buildings, not where people live or sleep, not the heating plant.
    assert not [n for n in names if "Uygulamalı" in n or "Yurdu" in n or "Isıtma" in n]
    lots = [place for place in places["places"] if place["kind"] == "parking"]
    assert len(lots) == 1  # the lot next to SUBÜ's building is not ours
    road = names["Kampüs İçi Yolu"]
    outline = places["campus"]["geometry"]["coordinates"][0]
    assert all(inside(tuple(p), outline) for part in road["geometry"]["coordinates"] for p in part)
    assert names["Test önü"]["kind"] == "area"  # the hand-placed outdoor camera's area


def test_every_camera_feeds_a_place_of_its_kind_inside_the_campus(tmp_path) -> None:
    places, cameras, example = build(tmp_path)
    by_id = {place["id"]: place for place in places["places"]}
    outline = places["campus"]["geometry"]["coordinates"][0]
    kinds = {
        ("crowd", False): "area",
        ("crowd", True): "building",
        ("parking", False): "parking",
        ("traffic", False): "road",
    }
    for camera in cameras:
        place = by_id[camera["place"]]
        assert place["kind"] == kinds[(camera["kind"], camera.get("indoor", False))], camera["id"]
        assert inside((camera["longitude"], camera["latitude"]), outline), camera["id"]
    indoor = [c for c in cameras if c.get("indoor")]
    footprint = by_id[indoor[0]["place"]]["geometry"]["coordinates"][0]
    assert all(inside((c["longitude"], c["latitude"]), footprint) for c in indoor)
    assert {c["kind"] for c in cameras} == {"crowd", "parking", "traffic"}
    assert [c.id for c in load_cameras(example)] == [c["id"] for c in cameras]
    assert yaml.safe_load(example.read_text())  # loads as YAML
