import math

import pytest

from vision.density import DensityGrid, cell_center

ORIGIN = (40.7420, 30.3320)


def at(east: float, north: float) -> tuple[float, float]:
    """The point east/north metres from the grid's origin."""
    lat = ORIGIN[0] + north / 111_320
    return lat, ORIGIN[1] + east / (111_320 * math.cos(math.radians(ORIGIN[0])))


def settle(grid: DensityGrid, points: list[tuple[float, float]], frames: int = 30):
    for _ in range(frames):
        cells = grid.update(points)
    return cells


def test_cell_centre_is_the_middle_of_its_3_m_cell() -> None:
    assert cell_center(*at(1.0, 1.0)) == pytest.approx(at(1.5, 1.5), abs=1e-7)
    # Negative offsets round down, not towards zero: -0.1 m lies in the cell from -3 to 0.
    assert cell_center(*at(-0.1, -0.1)) == pytest.approx(at(-1.5, -1.5), abs=1e-7)


def test_two_people_in_one_cell_make_one_cell_of_weight_two() -> None:
    # Only the aggregate leaves vision: two people in a cell are one cell of weight 2 (CLAUDE.md §0.2).
    [cell] = settle(DensityGrid(), [at(1.0, 1.0), at(2.0, 2.5)])
    assert cell.weight == pytest.approx(2.0, abs=0.01)
    assert (cell.lat, cell.lng) == cell_center(*at(1.0, 1.0))


def test_cells_from_two_cameras_share_centres() -> None:
    [a] = DensityGrid().update([at(10.2, -4.4)])
    [b] = DensityGrid().update([at(11.9, -5.9)])  # same cell: east 9 to 12, north -6 to -3
    assert (a.lat, a.lng) == (b.lat, b.lng)


def test_weight_decays_when_people_leave() -> None:
    grid = DensityGrid()
    [cell] = settle(grid, [at(1, 1)])
    [after] = grid.update([])
    assert after.weight == pytest.approx(0.7 * cell.weight, abs=0.001)  # EMA, alpha 0.3


def test_tiny_weights_are_dropped() -> None:
    grid = DensityGrid()
    [first] = grid.update([at(1, 1)])
    assert first.weight == pytest.approx(0.3)
    # 0.21, 0.147, 0.103, 0.072, 0.0504: still above the 0.05 floor ...
    for _ in range(5):
        assert len(grid.update([])) == 1
    # ... then 0.035: gone.
    assert grid.update([]) == []


def test_cells_are_capped_at_the_contract_limit() -> None:
    # The API rejects a reading with too many cells, which would turn the camera grey for nothing.
    grid = DensityGrid(max_cells=2)
    cells = grid.update([at(1, 1), at(1, 1), at(1, 1), at(4, 1), at(4, 1), at(7, 1)])
    assert sorted(round(c.weight, 3) for c in cells) == [0.6, 0.9]
