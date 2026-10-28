# Data sources

Every video clip and dataset used by Campus Live, with its license, **before** it is used
(CLAUDE.md §0.3, §3.7). Files live in `services/vision/videos/` and `services/vision/datasets/` and are
never committed.

## In use

| Clip / dataset                                                     | Used by cameras                                                                 | Source                                                                                                                                                          | License                                                                                                                                                                                                                                                                                                                                                                                      | Shows                                                                                                                                                                                                        | Checked by, date                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| WILDTRACK (EPFL CVLAB)                                             | crowd cameras: the 7 plaza ones in sync, the others via `tools/assign_clips.py` | https://www.epfl.ch/labs/cvlab/data/data-wildtrack/ (frames + calibration: `Wildtrack_dataset_full.zip`; videos: one Google Drive link per camera on that page) | "Unless explicitely distributed under a GPL licence, the data that can be dowloaded from this site should only be used for research and evaluation purposes. For any form of non GPL commercial usage, prior approval from EPFL should be obtained in writing." [EVIDENCED, CVLab data page https://www.epfl.ch/labs/cvlab/data/, 2026-10-27; the WILDTRACK page itself has no license text] | 7 GoPro cameras (1920×1080, 60 fps) with overlapping views of a pedestrian plaza in front of ETH Zurich's main building; OpenCV pinhole calibration (intrinsic + extrinsic); synchronized                    | Research + EPFL page read, 2026-10-27; zip downloaded and checked, license text re-read, 2026-10-28 |
| Pexels 854745 "Cars On The Road" (uploaded by the Pixabay account) | traffic cameras, via `tools/assign_clips.py --kind traffic`                     | https://www.pexels.com/video/cars-on-the-road-854745/ (file `854745-hd_1280_720_50fps.mp4`)                                                                     | Pexels License: "All photos and videos on Pexels can be downloaded and used for free." "Attribution is not required." Condition: "Identifiable people may not appear in a bad light or in a way that is offensive." [EVIDENCED, pexels.com/license and the clip page ("License: Free"), 2026-10-28]                                                                                          | A fixed, elevated camera over a dual carriageway: vehicles only, no parked cars (so no road zone is needed yet, #36); 1280×720, 50 fps, 60 s. Played at 5 fps (every 10th frame) so one PC runs many cameras | buncho, 2026-10-28                                                                                  |

### WILDTRACK: what the files are

What the calibration loader (`services/vision/src/vision/calibration.py`) assumes. Researched
2026-10-27 without the dataset; checked against the downloaded `Wildtrack_dataset_full.zip` on
2026-10-28 by projecting its annotations (9,518 person entries in 400 files) through each calibration:

- **Frames, not the raw videos, go with the shipped calibration.** `Image_subsets/C1`..`C7` each hold
  401 frames, `00000000.png` to `00002000.png` in steps of 5: the numbers count 10 fps frames, so the
  subset is **2 fps**, about 200 s (`tools/frames_to_video.py ... --fps 2`) [EVIDENCED, file listing].
  `annotations_positions/` has 400 files, `00000000.json` to `00001995.json`; frame `00002000` has none.
  `calibrations/intrinsic_zero/` fits these frames: annotated ground positions land a median 2–16 px
  from the annotated feet [EVIDENCED, projection]. The raw 60 fps videos go with
  `calibrations/intrinsic_original/`, which the zip also holds [EVIDENCED, the zip's `README.txt`; not
  tested].
- **File formats:** `intr_<camera>.xml` holds OpenCV FileStorage matrices `camera_matrix` and
  `distortion_coefficients`; `extrinsic/extr_<camera>.xml` holds `<rvec>` and `<tvec>` as plain numbers
  [EVIDENCED, the loader reads all 7 cameras' files].
- **World unit:** centimetres. Positions in centimetres land a median 2–16 px from the feet; in metres,
  362–2,076 px [EVIDENCED, projection]. The annotations' `positionID` grid is in metres (README:
  2.5 cm spacing, origin (-3.0, -9.0)), so multiply by 100.
- **Camera order:** C1..C7 = CVLab1-4, IDIAP1-3 [EVIDENCED, two checks]. (1) Annotated view `viewNum`
  v projects best through the v-th calibration: median 2–16 px, every other pairing 243 px or more.
  (2) YOLO11n on 5 frames of folder Cn matches 33–71 % of view n-1's annotated boxes (IoU ≥ 0.5),
  and at most 10 % of any other view's.
- **Z axis points up:** a point 170 cm above the feet lands a median 9–30 px from the box top; 170 cm
  below, 290–646 px [EVIDENCED, projection].

## Car footage: candidates for parking and traffic (license checked 2026-10-28, per clip at download)

WILDTRACK has no cars. Fixed, elevated parking clips with a free license are rare: these are the best
found, each license read on Pexels' own pages. Record a clip under "In use" when it is downloaded.

| Clip                                                                                         | For     | Shot                                | License                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Pexels "Aerial View of Crowded Car Parking Lot" (pexels.com/video/33610407), 23 s, 1080p     | parking | top-down, a hovering (static) drone | Pexels License: "All photos and videos on Pexels are free to use." "Attribution is not required." [EVIDENCED, pexels.com/license] |
| Pexels "An Aerial View of a Parking Lot with Cars" (pexels.com/video/28125710), 28 s, 4K     | parking | top-down, a hovering drone          | Pexels License [EVIDENCED]                                                                                                        |
| Pexels "A Footage of a Covered Parking Lot" (pexels.com/video/9100884), 15 s, 4K             | parking | fixed, elevated, a covered lot      | Pexels License [EVIDENCED]                                                                                                        |
| Pexels "The Intersection of a Street and a Building" (pexels.com/video/18721459), 15 s, 4K   | traffic | fixed, elevated                     | Pexels License [EVIDENCED]                                                                                                        |
| Pexels "Busy Urban Intersection with Tram and Traffic" (pexels.com/video/33865605), 16 s, 4K | traffic | fixed, elevated                     | Pexels License [EVIDENCED]                                                                                                        |

Short clips are fine: cameras loop them. **Do not use:** Mixkit "Seemingly endless view of a rental
car park" (its free download is "for Personal Use only, under the Mixkit Restricted License"), and
Coverr clips (its license forbids use "as a dataset in any form"). Video datasets with parking scenes
(VIRAT, UFPArk) need a signed agreement or an unverified license; PKLot and CNRPark+EXT are images only.

## Map tiles

| Service                                                                           | Used by                | Terms                                                                                                                                                                                                                                                                                                                                                                | Checked    |
| --------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| OpenFreeMap public instance (style `liberty`, darkened in the apps for dark mode) | the web and phone maps | "completely free: there are no limits on the number of map views or requests. There's no registration, no user database, no API keys, and no cookies."; "Is commercial usage allowed? Yes."; "Attribution is required. If you are using MapLibre, they are automatically added" [EVIDENCED, openfreemap.org]; terms of service: provided "as-is," with no warranties | 2026-10-27 |

Map data © OpenStreetMap contributors (ODbL), shown in the map's attribution.

## Assistant LLM

| Service                                                                         | Used by                           | Terms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Checked    |
| ------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Google Gemini API, free tier ("Unpaid Services"), model `gemini-3.5-flash-lite` | the API's assistant (server side) | "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services"; "human reviewers may read, annotate, and process your API input and output"; "Do not submit sensitive, confidential, or personal information to the Unpaid Services"; "You must be 18 years of age or older to use the APIs"; "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom" [EVIDENCED, ai.google.dev/gemini-api/terms] | 2026-10-28 |

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
