<!-- SPDX-License-Identifier: Apache-2.0 -->

# Image Metadata Reader

A lightweight, browser-based application for inspecting metadata embedded in image files.

The application displays available image, camera, GPS, AI-generation, and raw metadata in separate tabs. It processes selected files locally in your browser and uses a small plugin system to keep metadata features independent.

## Features

- **Local image inspection:** Select images from your device; image files and metadata are not uploaded by the application.
- **Multiple images:** Load multiple files, view thumbnails, and switch between images.
- **General properties:** View file and image details such as dimensions and file size where available.
- **Camera information:** Inspect photographic metadata such as camera make and model or exposure details when embedded.
- **GPS information:** View available GPS coordinates and follow supported map links.
- **AI metadata:** Read recognized prompts and generation parameters when they are embedded in a supported format.
- **Raw metadata:** Search the metadata tags returned by the parser.
- **BMP/TGA headers:** Read supported dimensions and pixel-depth information directly from BMP and TGA headers.
- **TGA previews:** Preview the tested 24-bit and 32-bit true-color uncompressed and RLE variants.
- **Plugin-based design:** Add metadata handling as an independent JavaScript plugin.
- **No build tools required:** Run the application without installing Node.js, npm, or a framework.

Metadata is only shown when it exists in the selected file and can be read by the application. A file extension or preview does not guarantee embedded metadata is available.

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- [ExifReader](https://github.com/mattiasw/ExifReader) 4.54.0 for image metadata parsing
- A local image-format helper for BMP/TGA header reading and tested TGA previews

ExifReader is vendored locally and is separately licensed under MPL-2.0. See [Third-Party Components](#third-party-components).

## Project Structure

```text
Image-Metadata-Reader/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   └── plugin-system.js
├── lib/
│   ├── exif-reader.js
│   └── image-format-reader.js
├── plugins/
│   ├── plugin-general.js
│   ├── plugin-camera.js
│   ├── plugin-location.js
│   ├── plugin-ai-metadata.js
│   ├── plugin-rawdata.js
│   └── plugin-raster-header.js
└── test/
    ├── regression.html
    ├── regression.js
    └── validation-samples/
```

Plugins are loaded explicitly by script tags in `index.html`; the application does not discover plugins automatically. See [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md) for the plugin API and instructions for adding a plugin.

## Getting Started

### 1. Download the project

Download or clone the repository. Keep the directory structure intact so local scripts and styles load correctly.

### 2. Launch the application

Open `index.html` in a modern browser. No build or dependency installation is required. If your browser restricts local file access, serve the project directory with a local static web server.

### 3. Select and inspect images

1. Drag images into the application or choose them with the file picker.
2. Select an image from the preview or thumbnail strip.
3. Click **RUN METADATA READER**.
4. Choose a metadata category tab to inspect the available results.

The application does not change the original files. Metadata availability depends on each file and the parser's format support.

## Privacy

Image processing is performed locally in the browser using scripts included with the project. The application does not upload selected images or metadata to a remote processing service.

This describes the application's local processing behavior; review any scripts or hosting integrations you add separately.

## Testing

The project includes a browser-based regression suite and does not require Node.js or npm.

1. Open `test/regression.html` in a browser.
2. Choose the `test/validation-samples/` folder when prompted.
3. Click **Run regression suite** and review the report.

The current suite covers **27 general samples, 10 AI samples (37 total), and 8 stability checks**. It verifies the available files and reports expected missing sample paths, if any. Some parser errors for unsupported BMP/TGA embedded metadata and the deliberate plugin-failure test are expected conditions.

The browser suite is not an automated headless test runner. For the verified formats and remaining limitations, see [Problems.md](Problems.md).

## Known Limitations

- **BMP/TGA embedded metadata:** The current parser does not extract embedded EXIF/XMP metadata from the supplied BMP/TGA files. The raster-header plugin reads supported header properties separately.
- **TGA preview formats:** Preview handling has been verified for the supplied 24-bit uncompressed and 32-bit RLE true-color samples. Other TGA variants are not verified.
- **AI metadata formats:** The available samples cover only the represented metadata structures. Midjourney and DALL-E metadata variants are not verified.
- **Browser and encoding support:** Preview and metadata parsing can vary by browser, file encoding, and the metadata actually present.

See [Problems.md](Problems.md) for the current verification details. Do not interpret unverified formats as supported.

## License

Original project code and documentation are licensed under the **Apache License 2.0**. See [LICENSE](LICENSE).

### Third-Party Components

- **ExifReader 4.54.0** is separately licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. Its verified attribution and license text are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The project's Apache license does not replace or relicense ExifReader.

The validation images are test data and are not covered by the project's Apache license. Confirm permission and include required attribution or license notices before redistributing them.

