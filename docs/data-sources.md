# Data sources

Every video clip and dataset used by Campus Live, with its license, **before** it is used
(CLAUDE.md §0.3, §3.7). Files themselves live in `services/vision/videos/` and are never committed.

| Clip / dataset                                                                                                     | Used by camera                             | Source (URL)                                        | License                                                                                                                                                                                                                         | Shows                                                                                                                      | Checked by, date   |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| WILDTRACK (EPFL CVLab): views C1 and C4, 401 frames each at 2 fps (about 200 s), from `Wildtrack_dataset_full.zip` | `kutuphane-giris` (C1), `kafe-merkez` (C4) | https://www.epfl.ch/labs/cvlab/data/data-wildtrack/ | **None stated** on the page or in the zip's `README.txt`, which asks users to cite T. Chavdarova et al., "The WILDTRACK Multi-Camera Person Dataset" (arXiv:1707.09299). Used by team decision D13; cite it in the demo credits | Unscripted pedestrians in front of ETH Zurich's main building, 7 static HD views; ground-truth person boxes for 400 frames | buncho, 2026-10-28 |

**Rules**

- Licensed footage: copy the license name and URL from the source page, and note any condition
  (attribution, non-commercial, no identifiable people in a bad light).
- Our own recordings: who appears, and that they agreed.
- Web videos without a reuse license (YouTube downloads) need a team decision first (D6).

**Candidates to check** (licenses not verified yet): Pexels and Pixabay stock video; Creative Commons
videos; the PKLot and CNRPark-EXT parking-lot datasets.
