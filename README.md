<!-- SPDX-License-Identifier: Apache-2.0 -->

# Image Metadata Reader

A browser-based image metadata reader with an extensible plugin system. Select images from your device to inspect available file, camera, GPS, AI-generation, and raw metadata. Processing runs locally in your browser.

## Run the application

No installation, build step, or server is required:

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Drop images into the page or use the file picker, then select an image and run the metadata reader.

The application does not upload images or metadata. Results depend on what metadata is embedded in each file and what the browser and parser can read.

## Features

- Separate tabs for general properties, camera information, GPS data, AI metadata, raw metadata, and raster-header details.
- Multiple image selection with previews and thumbnails.
- BMP/TGA header information where the file header can be read; tested TGA variants can also be previewed.
- Plugin-based metadata extraction using plain JavaScript.
- Local script assets; there is no build process or package installation.

## Browser regression suite

Open `test/regression.html`, choose the `test/validation-samples/` folder when prompted, and run the suite. The current test set contains 27 general samples, 10 AI samples, and eight stability checks.

The suite reports whether each expected sample is present. If a sample is absent, the report identifies it; passing results should be read alongside those notices. Some metadata-processing errors and the deliberate plugin-failure test are expected during the checks.

The suite verifies behavior against the available samples, not every image encoding or metadata variant. The regression page is browser-based and does not currently have an automated headless runner.

## Known limitations

- Embedded EXIF/XMP metadata extraction from BMP and TGA is not supported by the current parser. Header properties are separate from embedded metadata.
- TGA preview support is limited to tested 24/32-bit true-color uncompressed and RLE variants. Other TGA variants are not verified.
- AI metadata support is verified only for formats represented in the supplied samples. Midjourney and DALL-E metadata variants are not verified.
- Preview and metadata support can vary with the browser, file encoding, and metadata present in the image.

See [Problems.md](Problems.md) for the current verification status and limitations.

## Project structure

- `index.html`, `css/` — application interface and styles.
- `js/` — application and plugin-system core.
- `plugins/` — independently registered metadata plugins.
- `lib/` — image format helper and vendored ExifReader.
- `test/` — browser regression suite and validation samples.

For the architecture, plugin API, and instructions for adding a plugin, see [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md) and [DESIGN.md](DESIGN.md).

## Licensing

Original project code and documentation are licensed under the Apache License 2.0. See [LICENSE](LICENSE).

ExifReader is a separately licensed third-party dependency (MPL-2.0). Its version, attribution, and license details are recorded in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The project license does not replace or relicense ExifReader.
