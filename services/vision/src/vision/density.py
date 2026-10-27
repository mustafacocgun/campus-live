"""Projected feet -> people per 3 m cell of one campus-wide grid, smoothed over time.

The grid is anchored at a fixed campus origin, so cells from different cameras line up and the
clients can merge them. Only these per-cell weights leave the vision service (CLAUDE.md §0.2).
"""

import heapq
import math
from collections import Counter

from vision.contracts import DensityCell
from vision.projection import M_PER_DEG_LAT

ORIGIN = (40.7420, 30.3320)
CELL_M = 3.0
# The most cells a CameraReading may carry (packages/contracts).
MAX_CELLS = 2000

Cell = tuple[int, int]


def _cell(lat: float, lng: float, origin: tuple[float, float], cell_m: float) -> Cell:
    east = (lng - origin[1]) * M_PER_DEG_LAT * math.cos(math.radians(origin[0]))
    north = (lat - origin[0]) * M_PER_DEG_LAT
    return math.floor(east / cell_m), math.floor(north / cell_m)


def _centre(cell: Cell, origin: tuple[float, float], cell_m: float) -> tuple[float, float]:
    east, north = (cell[0] + 0.5) * cell_m, (cell[1] + 0.5) * cell_m
    lat = origin[0] + north / M_PER_DEG_LAT
    lng = origin[1] + east / (M_PER_DEG_LAT * math.cos(math.radians(origin[0])))
    return round(lat, 7), round(lng, 7)


def cell_center(
    lat: float, lng: float, origin: tuple[float, float] = ORIGIN, cell_m: float = CELL_M
) -> tuple[float, float]:
    """The centre of the grid cell that holds (lat, lng)."""
    return _centre(_cell(lat, lng, origin, cell_m), origin, cell_m)


class DensityGrid:
    """One camera's people per cell, smoothed per cell (EMA) over the sampled frames."""

    def __init__(
        self,
        origin: tuple[float, float] = ORIGIN,
        cell_m: float = CELL_M,
        alpha: float = 0.3,
        floor: float = 0.05,
        max_cells: int = MAX_CELLS,
    ) -> None:
        self.origin, self.cell_m, self.alpha, self.floor, self.max_cells = (
            origin,
            cell_m,
            alpha,
            floor,
            max_cells,
        )
        self._weights: dict[Cell, float] = {}

    def update(self, points: list[tuple[float, float]]) -> list[DensityCell]:
        """Add one frame's projected feet; returns the cells at or above the floor, heaviest first."""
        counts = Counter(_cell(lat, lng, self.origin, self.cell_m) for lat, lng in points)
        weights = {
            cell: (1 - self.alpha) * self._weights.get(cell, 0.0) + self.alpha * counts[cell]
            for cell in self._weights.keys() | counts.keys()
        }
        self._weights = {cell: weight for cell, weight in weights.items() if weight >= self.floor}
        heaviest = heapq.nlargest(self.max_cells, self._weights.items(), key=lambda item: item[1])
        return [
            DensityCell(lat=lat, lng=lng, weight=round(weight, 3))
            for cell, weight in heaviest
            for lat, lng in [_centre(cell, self.origin, self.cell_m)]
        ]
