// The campus (way 216324005, "Sakarya Üniversitesi") and its buildings, parking lots and roads, for
// tools/build_campus.py. Run at https://overpass-api.de/api/interpreter and save the JSON.
[out:json][timeout:90];
way(216324005)->.campus;
.campus out geom tags;
.campus map_to_area->.a;
(
  way["building"](area.a);
  way["amenity"="parking"](area.a);
  way["highway"~"^(tertiary|secondary|residential|service|unclassified|living_street)$"](area.a);
);
out geom tags;
