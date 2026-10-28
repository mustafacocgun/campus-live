"""Campus places and cameras from OpenStreetMap: what users see (config/places.json) and every camera
that feeds it (config/cameras.json), plus the processing template (configs/cameras.example.yaml).

    python tools/build_campus.py --osm campus.json     # campus.json from tools/campus.overpassql
    npx prettier --write ../../config                   # the repo's JSON style

Places: the campus outline; SAÜ's named buildings where people study, eat or work (lit by indoor
cameras); every SAÜ parking lot; the campus roads, clipped to the outline. Never SUBÜ's buildings or
lots, never where people live or sleep (CLAUDE.md §3.2). The hand-placed outdoor crowd cameras already
in config/cameras.json are kept, each feeding an area. Everything is a placeholder until the team
confirms it (§0.5). Map data © OpenStreetMap contributors, ODbL.

The generated camera spots follow fixed rules on public shapes, so anyone with this file can work them
out: demo placeholders only. Real camera spots are entered by hand, never generated (D19).
"""

import argparse
import json
import math
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
CAMPUS_WAY = 216324005  # "Sakarya Üniversitesi", amenity=university
LAT0 = 40.742
KX, KY = 111_320 * math.cos(math.radians(LAT0)), 111_320  # metres per degree of longitude, latitude
# Where an outdoor area's name goes: on this grid (metres), never at a camera's view centre.
LABEL_GRID_M = 30

# Not ours, or not a place for a camera: SUBÜ shares the outline; people live or sleep in the dormitory
# and the hotel; nobody gathers in the heating plant, the print house, labs or company offices.
EXCLUDE = (
    "Uygulamalı Bilimler",
    "Yurdu",
    "Hotel",
    "Isıtma",
    "Basımevi",
    "Laboratuvar",
    "Teknokent",
    "Teknoloji Geliştirme",
    "Ofis",
)
SECTIONS = [
    ("Kütüphane", ("Kütüphane",)),
    ("Yemekhane", ("Yemekhane",)),
    ("Kafeler", ("Kafe", "Kantin", "Coffee", "Kafeterya", "Saklı Bahçe")),
    ("Fakülteler", ("Fakülte", "fakültesi", "Mühendislik", "M2 ", "M4 ", "M6 ", "M7 ", "İnşaat", "Enstitü")),
]
TR_ASCII = str.maketrans("çğıöşüÇĞİÖŞÜâîû", "cgiosuCGIOSUaiu")


def xy(lat: float, lng: float) -> tuple[float, float]:
    return (lng - 30.332) * KX, (lat - LAT0) * KY


def latlng(x: float, y: float) -> tuple[float, float]:
    return round(LAT0 + y / KY, 6), round(30.332 + x / KX, 6)


def slug(text: str) -> str:
    folded = text.replace("İ", "i").replace("I", "ı").lower().translate(TR_ASCII)
    return "-".join(part for part in "".join(c if c.isalnum() else " " for c in folded).split())


def display_name(name: str) -> str:
    name = name.removeprefix("Sakarya Üniversitesi ").strip()
    if name == name.lower():  # some OSM names are all lowercase: title-case them, Turkish style
        name = " ".join(
            word
            if word == "ve"
            else word.replace("i", "İ", 1)[0] + word[1:]
            if word[0] == "i"
            else word[0].upper() + word[1:]
            for word in name.split()
        )
    return name


def section_for(name: str) -> str:
    for section, words in SECTIONS:
        if any(word in name + " " for word in words):
            return section
    return "Kampüs binaları"


def area_m2(points: list[tuple[float, float]]) -> float:
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(points, points[1:], strict=False))) / 2


def centroid(points: list[tuple[float, float]]) -> tuple[float, float]:
    xs, ys = zip(*points[:-1], strict=True)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def inside(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(polygon, polygon[1:], strict=False):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def length_m(points: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(points, points[1:], strict=False))


def bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    return round(math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360, 1)


def lnglat(points: list[tuple[float, float]]) -> list[list[float]]:
    return [[lng, lat] for lat, lng in (latlng(x, y) for x, y in points)]


def clip_to(points: list[tuple[float, float]], outline: list[tuple[float, float]]) -> list[list]:
    """The runs of a line's points that lie inside the outline (a road may run past the campus)."""
    runs, run = [], []
    for point in points:
        if inside(point, outline):
            run.append(point)
        else:
            if len(run) >= 2:
                runs.append(run)
            run = []
    if len(run) >= 2:
        runs.append(run)
    return runs


def connected(lines: list[list[tuple[float, float]]]) -> list[list[list[tuple[float, float]]]]:
    """Group lines that share an end point: one unnamed street made of several OSM ways."""
    parent = list(range(len(lines)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    ends: dict[tuple[float, float], int] = {}
    for i, line in enumerate(lines):
        for end in (line[0], line[-1]):
            key = (round(end[0], 1), round(end[1], 1))
            if key in ends:
                parent[find(i)] = find(ends[key])
            ends.setdefault(key, i)
    groups: dict[int, list] = {}
    for i, line in enumerate(lines):
        groups.setdefault(find(i), []).append(line)
    return sorted(groups.values(), key=lambda group: -sum(length_m(line) for line in group))


def camera(
    camera_id: str,
    name: str,
    section: str,
    kind: str,
    at: tuple[float, float],
    heading: float,
    fov: float,
    range_m: float,
    place: str,
    indoor: bool = False,
) -> dict:
    lat, lng = latlng(*at)
    entry = {
        "id": camera_id,
        "name": name,
        "section": section,
        "kind": kind,
        "latitude": lat,
        "longitude": lng,
        "heading": heading,
        "fovDeg": fov,
        "rangeM": range_m,
        "place": place,
    }
    return entry | ({"indoor": True} if indoor else {})


def along(points: list[tuple[float, float]], fraction: float) -> tuple[tuple[float, float], float]:
    """The point a fraction of the way along a line, and the line's bearing there."""
    target, walked = length_m(points) * fraction, 0.0
    for a, b in zip(points, points[1:], strict=False):
        step = math.dist(a, b)
        if walked + step >= target and step:
            t = (target - walked) / step
            return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])), bearing(a, b)
        walked += step
    return points[-1], bearing(points[-2], points[-1])


def build(osm: dict, outdoor: list[dict]) -> tuple[dict, list[dict]]:
    ways = {e["id"]: e for e in osm["elements"] if e.get("type") == "way" and e.get("geometry")}
    outline = [xy(p["lat"], p["lon"]) for p in ways[CAMPUS_WAY]["geometry"]]
    if outline[0] != outline[-1]:
        outline.append(outline[0])
    places, cameras, used = [], [], set()
    # Place ids are served to everyone and camera ids to no one (CLAUDE.md §0.2).
    camera_ids = {cam["id"] for cam in outdoor}

    def unique(base: str, word: str = "") -> str:
        """`base`, or `base-<word>` when a hand-placed camera has that id; `-2`, `-3`… when a place has it."""
        if word and base in camera_ids:
            base = f"{base}-{word}"
        candidate, n = base, 2
        while candidate in used:
            candidate, n = f"{base}-{n}", n + 1
        used.add(candidate)
        return candidate

    elements = [e for way_id, e in ways.items() if way_id != CAMPUS_WAY]
    subu = [
        centroid([xy(p["lat"], p["lon"]) for p in e["geometry"]])
        for e in elements
        if "Uygulamalı Bilimler" in e["tags"].get("name", "")
    ]

    # Outdoor areas: the hand-placed outdoor crowd cameras, grouped by name ("Kütüphane meydanı 3").
    groups: dict[str, list[dict]] = {}
    for cam in outdoor:
        groups.setdefault(cam["name"].rstrip("0123456789 ").strip(), []).append(cam)
    for name, members in groups.items():
        # "Taş Kafe" -> "Taş Kafe önü"; names that already say where ("Kütüphane yolu") stay.
        keep = ("yolu", "meydanı", "önü", "batı", "doğu", "kuzey", "güney")
        area_name = name if len(members) > 1 or name.endswith(keep) else f"{name} önü"
        place_id = unique(slug(area_name), "alani")
        views = [xy(c["latitude"], c["longitude"]) for c in members]
        centres = [
            (
                x + 0.5 * c["rangeM"] * math.sin(math.radians(c["heading"])),
                y + 0.5 * c["rangeM"] * math.cos(math.radians(c["heading"])),
            )
            for (x, y), c in zip(views, members, strict=True)
        ]
        middle = (sum(p[0] for p in centres) / len(centres), sum(p[1] for p in centres) / len(centres))
        # On a coarse grid: at the view centre itself (half the range ahead of the camera), the label and
        # the heat's heading would give the camera's spot away (D19).
        label = tuple(round(v / LABEL_GRID_M) * LABEL_GRID_M for v in middle)
        places.append(
            {
                "id": place_id,
                "name": area_name,
                "section": members[0]["section"],
                "kind": "area",
                "geometry": {"type": "Point", "coordinates": lnglat([label])[0]},
            }
        )
        cameras += [cam | {"place": place_id} for cam in members]

    # Buildings with indoor cameras.
    named = [e for e in elements if "building" in e["tags"] and e["tags"].get("name")]
    for e in sorted(named, key=lambda e: e["tags"]["name"]):
        raw = e["tags"]["name"]
        footprint = [xy(p["lat"], p["lon"]) for p in e["geometry"]]
        if any(word in raw for word in EXCLUDE) or not inside(centroid(footprint), outline):
            continue
        name = display_name(raw)
        place_id = unique(slug(name), "binasi")
        section = section_for(name)
        places.append(
            {
                "id": place_id,
                "name": name,
                "section": section,
                "kind": "building",
                "geometry": {"type": "Polygon", "coordinates": [lnglat(footprint)]},
            }
        )
        middle, size = centroid(footprint), area_m2(footprint)
        count = 1 if size < 2500 else 2 if size < 6000 else 3
        for n in range(count):
            spot = _inside_spot(footprint, middle, n, count)
            cameras.append(
                camera(
                    f"{place_id}-ic-{n + 1}",
                    f"{name} iç {n + 1}",
                    section,
                    "crowd",
                    spot,
                    bearing(spot, middle) if spot != middle else 0.0,
                    90,
                    15,
                    place_id,
                    True,
                )
            )

    # Parking lots, named after the nearest building.
    buildings = [(p["name"], xy(*reversed(_centre_of(p)))) for p in places if p["kind"] == "building"]
    lots = [e for e in elements if e["tags"].get("amenity") == "parking"]
    for e in sorted(lots, key=lambda e: e["id"]):
        shape = [xy(p["lat"], p["lon"]) for p in e["geometry"]]
        middle = centroid(shape)
        if not inside(middle, outline) or any(math.dist(middle, s) < 100 for s in subu):
            continue
        near = min(buildings, key=lambda b: math.dist(middle, b[1])) if buildings else None
        base = f"{near[0]} otoparkı" if near and math.dist(middle, near[1]) < 150 else "Otopark"
        place_id = unique(slug(base))
        name = base if place_id == slug(base) else f"{base} {place_id.rsplit('-', 1)[-1]}"
        places.append(
            {
                "id": place_id,
                "name": name,
                "section": "Otoparklar",
                "kind": "parking",
                "geometry": {"type": "Polygon", "coordinates": [lnglat(shape)]},
            }
        )
        corner = max(shape, key=lambda p: math.dist(p, middle))
        spot = (corner[0] + 0.1 * (middle[0] - corner[0]), corner[1] + 0.1 * (middle[1] - corner[1]))
        reach = min(150, max(10, round(2 * math.dist(spot, middle))))
        cameras.append(
            camera(
                f"{place_id}-1",
                f"{name} kamera",
                "Otoparklar",
                "parking",
                spot,
                bearing(spot, middle),
                80,
                reach,
                place_id,
            )
        )

    # Roads: the named ones, then the longest unnamed streets, clipped to the campus.
    roads: dict[str, list] = {}
    unnamed: list = []
    for e in elements:
        if e["tags"].get("highway") not in ("tertiary", "residential", "unclassified"):
            continue
        for run in clip_to([xy(p["lat"], p["lon"]) for p in e["geometry"]], outline):
            if name := e["tags"].get("name"):
                roads.setdefault(name, []).append(run)
            else:
                unnamed.append(run)
    numbered = [g for g in connected(unnamed) if sum(length_m(line) for line in g) >= 300][:6]
    roads |= {f"Kampüs yolu {n + 1}": group for n, group in enumerate(numbered)}
    for name, parts in roads.items():
        place_id = unique(slug(name))
        places.append(
            {
                "id": place_id,
                "name": name,
                "section": "Yollar",
                "kind": "road",
                "geometry": {"type": "MultiLineString", "coordinates": [lnglat(p) for p in parts]},
            }
        )
        longest = max(parts, key=length_m)
        count = min(3, max(1, round(sum(length_m(p) for p in parts) / 400)))
        for n in range(count):
            spot, heading = along(longest, (n + 1) / (count + 1))
            cameras.append(
                camera(
                    f"{place_id}-{n + 1}",
                    f"{name} kamera {n + 1}",
                    "Yollar",
                    "traffic",
                    spot,
                    heading,
                    60,
                    40,
                    place_id,
                )
            )

    if clash := {p["id"] for p in places} & {c["id"] for c in cameras}:
        raise ValueError(f"place ids equal to camera ids: {sorted(clash)}")
    campus = {
        "name": "Sakarya Üniversitesi",
        "geometry": {"type": "Polygon", "coordinates": [lnglat(outline)]},
    }
    return {"campus": campus, "places": places}, cameras


def _inside_spot(
    footprint: list[tuple[float, float]], middle: tuple[float, float], n: int, count: int
) -> tuple[float, float]:
    """A point inside the footprint for indoor camera n of count: halfway from the middle towards a
    corner, or nearer the middle, or towards another corner (L- and U-shaped buildings)."""
    corners = footprint[:-1]
    start = (n * max(1, len(corners) // count)) % len(corners)
    for corner in corners[start:] + corners[:start]:
        for t in (0.5, 0.3, 0.15):
            spot = (middle[0] + t * (corner[0] - middle[0]), middle[1] + t * (corner[1] - middle[1]))
            if inside(spot, footprint):
                return spot
    return middle


def _centre_of(place: dict) -> tuple[float, float]:
    ring = place["geometry"]["coordinates"][0]
    return sum(p[0] for p in ring[:-1]) / (len(ring) - 1), sum(p[1] for p in ring[:-1]) / (len(ring) - 1)


def example_yaml(cameras: list[dict], previous: dict[str, dict]) -> str:
    """The processing template: one entry per camera, keeping the outdoor cameras' settings."""
    lines = [
        "# Processing config for every camera in config/cameras.json (written by tools/build_campus.py).",
        "# Copy it to cameras.yaml (git-ignored), give cameras footage with tools/assign_clips.py, and run",
        "# with VISION_CAMERAS_FILE=configs/cameras.yaml. A camera without a source does not run (grey).",
        "# Thresholds are placeholders until a hand count calibrates them (CLAUDE.md §3.6). Parking",
        "# cameras get their slots from their clip (tools/draw_slots.py).",
        "cameras:",
    ]
    plaza_anchor = None
    for cam in cameras:
        lines += [f"  - id: {cam['id']}", f"    kind: {cam['kind']}"]
        before = previous.get(cam["id"], {})
        if cam["kind"] != "parking":
            default = (
                {"medium": 15, "high": 40}
                if cam.get("indoor")
                else {"medium": 3, "high": 8}
                if cam["kind"] == "traffic"
                else {"medium": 8, "high": 20}
            )
            t = before.get("thresholds", default)
            lines.append(f"    thresholds: {{ medium: {t['medium']}, high: {t['high']} }}")
        if wildtrack := before.get("wildtrack"):
            a = wildtrack["anchor"]
            anchor = f"{{ lat: {a['lat']}, lng: {a['lng']}, rotation_deg: {a.get('rotation_deg', 0)} }}"
            if plaza_anchor is None:
                plaza_anchor = anchor
                lines.append(f"    wildtrack: {{ camera: {wildtrack['camera']}, anchor: &plaza {anchor} }}")
            else:
                lines.append(f"    wildtrack: {{ camera: {wildtrack['camera']}, anchor: *plaza }}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Campus places and cameras from OpenStreetMap.")
    parser.add_argument("--osm", type=Path, required=True)
    parser.add_argument("--cameras", type=Path, default=ROOT / "config" / "cameras.json")
    parser.add_argument("--example", type=Path, default=ROOT / "services/vision/configs/cameras.example.yaml")
    parser.add_argument("--places-out", type=Path, default=ROOT / "config" / "places.json")
    parser.add_argument("--cameras-out", type=Path, default=ROOT / "config" / "cameras.json")
    parser.add_argument(
        "--example-out", type=Path, default=ROOT / "services/vision/configs/cameras.example.yaml"
    )
    args = parser.parse_args(argv)
    registry = json.loads(args.cameras.read_text())
    outdoor = [c for c in registry["cameras"] if c["kind"] == "crowd" and not c.get("indoor")]
    places, cameras = build(json.loads(args.osm.read_text()), outdoor)
    previous = {c["id"]: c for c in (yaml.safe_load(args.example.read_text()) or {}).get("cameras", [])}
    note = (
        "PLACEHOLDERS (CLAUDE.md §0.5), from OpenStreetMap (© OpenStreetMap contributors, ODbL) by "
        "tools/build_campus.py. What users see; served by the API."
    )
    args.places_out.write_text(json.dumps({"_note": note, **places}, ensure_ascii=False, indent=2) + "\n")
    camera_note = (
        "PRIVATE: read by the API and vision, never served (CLAUDE.md §0.2). Camera spots are PLACEHOLDERS "
        "(§0.5): the outdoor crowd cameras are hand-placed (the 7 'Kütüphane meydanı' ones are WILDTRACK's "
        "views); indoor, parking and traffic cameras come from tools/build_campus.py and OpenStreetMap "
        "(© OpenStreetMap contributors, ODbL). heading: degrees clockwise from north; fovDeg: horizontal "
        "view angle; rangeM: far edge of the view in metres; place: the place in config/places.json it feeds."
    )
    args.cameras_out.write_text(
        json.dumps({"_note": camera_note, "cameras": cameras}, ensure_ascii=False, indent=2) + "\n"
    )
    args.example_out.write_text(example_yaml(cameras, previous))
    kinds = {
        k: sum(1 for c in cameras if (c["kind"], bool(c.get("indoor"))) == k)
        for k in [("crowd", False), ("crowd", True), ("parking", False), ("traffic", False)]
    }
    print(f"{len(places['places'])} places, {len(cameras)} cameras: {kinds}")


if __name__ == "__main__":
    main()
