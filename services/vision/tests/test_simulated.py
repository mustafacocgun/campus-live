from conftest import EXAMPLE_CAMERAS, NOW
from vision.cameras import load_cameras
from vision.simulated import SimulatedCamera


def test_simulated_stays_in_bounds() -> None:
    for camera in load_cameras(EXAMPLE_CAMERAS):
        simulated = SimulatedCamera(camera, seed=1)
        for _ in range(1000):
            reading = simulated.next_reading(NOW)
            assert reading.source == "simulated"
            if camera.kind == "parking":
                assert 0 <= reading.parking.free <= reading.parking.total == camera.simulated_total
                assert reading.count == reading.parking.total - reading.parking.free
            else:
                assert 0 <= reading.count <= camera.thresholds.high * 1.5


def test_simulated_is_deterministic_per_seed() -> None:
    camera = load_cameras(EXAMPLE_CAMERAS)[0]

    def run(seed: int) -> list[int]:
        simulated = SimulatedCamera(camera, seed=seed)
        return [simulated.next_reading(NOW).count for _ in range(50)]

    assert run(7) == run(7)
    assert run(7) != run(8)
