# Data sources

Every video clip and dataset used by Campus Live, with its license, **before** it is used
(CLAUDE.md §0.3, §3.7). Files live in `services/vision/videos/` and `services/vision/datasets/` and are
never committed.

## In use

| Clip / dataset         | Used by cameras     | Source                                                                                                                                                          | License                                                                                                                                                                                                                                                                                                                                                                                      | Shows                                                                                                                                                                                     | Checked by, date                                                                                     |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| WILDTRACK (EPFL CVLAB) | the 7 plaza cameras | https://www.epfl.ch/labs/cvlab/data/data-wildtrack/ (frames + calibration: `Wildtrack_dataset_full.zip`; videos: one Google Drive link per camera on that page) | "Unless explicitely distributed under a GPL licence, the data that can be dowloaded from this site should only be used for research and evaluation purposes. For any form of non GPL commercial usage, prior approval from EPFL should be obtained in writing." [EVIDENCED, CVLab data page https://www.epfl.ch/labs/cvlab/data/, 2026-10-27; the WILDTRACK page itself has no license text] | 7 GoPro cameras (1920×1080, 60 fps) with overlapping views of a pedestrian plaza in front of ETH Zurich's main building; OpenCV pinhole calibration (intrinsic + extrinsic); synchronized | Research + EPFL page read, 2026-10-27; **not downloaded yet** (whoever downloads re-checks the page) |

### WILDTRACK: what the files are

What the calibration loader (`services/vision/src/vision/calibration.py`) assumes, checked 2026-10-27 without
downloading the dataset:

- **Frames, not the raw videos, go with the shipped calibration.** The zip holds frames "with removed
  distortions" at 10 fps (the first 2000 frames; 400 of them annotated at 2 fps) [EVIDENCED, paper
  arXiv 1707.09299]. `calibrations/intrinsic_zero/` belongs to those frames. The raw 60 fps videos need
  `intrinsic_original`, reportedly available from EPFL on request [WEAK, OpenTraj's README].
- **File formats:** `intr_<camera>.xml` holds OpenCV FileStorage matrices `camera_matrix` and
  `distortion_coefficients`; `extrinsic/extr_<camera>.xml` holds `<rvec>` and `<tvec>` as plain numbers
  [EVIDENCED, the dataset's own toolkit, github.com/Chavdarova/WILDTRACK-toolkit].
- **World unit:** centimetres for the calibration ("distances measured by hand in centimetres")
  [EVIDENCED, paper]; the paper's annotation section says metres, a known inconsistency.
- **Camera order** C1..C7 = CVLab1-4, IDIAP1-3 [WEAK, from MVDet's code]: check it against the files.
- **Not verified:** whether the world's Z axis points up or down (the projection handles both) and the
  exact frame file names. Whoever downloads the zip checks these and corrects this list.

## Candidates for the other camera spots (license checked 2026-10-27, per clip at download)

Grades: [EVIDENCED] read on the source's own page · [WEAK] second-hand or partly unreadable.

| Source                                          | License summary                                                                                            | Conditions to respect                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pexels                                          | Free to use and modify, no attribution [EVIDENCED, pexels.com/license]                                     | "Identifiable people may not appear in a bad light"; no redistribution on stock platforms                          |
| Pixabay                                         | Free, commercial or not, no attribution [EVIDENCED, pixabay.com/service/license]                           | No "immoral or illegal" use, "especially Content which features recognisable people"; no standalone redistribution |
| Mixkit                                          | Free License allows copy, modify, distribute [EVIDENCED for the quoted parts; restrictions WEAK]           | Each clip is Free or Restricted: check per clip                                                                    |
| Coverr                                          | Free, commercial or not, no credit [EVIDENCED, coverr.co/license]                                          | **Never use its frames to train or build AI models**: live input only                                              |
| Wikimedia Commons                               | Only CC BY, CC BY-SA or CC0 files [EVIDENCED]                                                              | Open every clip: titles are unreliable (a "fixed" clip checked was handheld)                                       |
| PETS 2009 (Reading)                             | Free for "academic and industrial research", source acknowledged [WEAK: servers unreachable on 2026-10-27] | Confirm it is still downloadable                                                                                   |
| EPFL multi-camera (Terrace, Passageway, Campus) | Same EPFL terms as WILDTRACK [EVIDENCED]                                                                   | Old codecs, short clips                                                                                            |

**Rules**

- Only clips filmed from a fixed, elevated position (no drones, no handheld).
- Licensed footage: copy the license name and URL from the clip's page, and note any condition.
- Our own recordings: who appears, and that they agreed.
- Web videos without a reuse license (YouTube downloads) need a team decision first (D6).

**Do not use:** the Oxford Town Centre dataset, withdrawn in 2020 because it filmed people without
consent. No parking-lot dataset with continuous video and a clear license was found (PKLot is still
images, CC BY 4.0).
