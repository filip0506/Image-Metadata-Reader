<!-- SPDX-License-Identifier: Apache-2.0 -->

# Extensible Local Image Metadata Reader

## Purpose and boundaries

The existing application is a browser-only image metadata reader. It reads local files in the browser, passes their `ArrayBuffer` data to the locally bundled ExifReader library, then sends one parsed tag object to independent feature plugins. The application does not pass URLs to ExifReader, upload images, or call a remote metadata service. The location plugin creates an optional Google Maps link; navigation happens only if the user follows that link.

The project is intentionally plain HTML, CSS, and JavaScript. It has no build step or package-managed test runner.

## Implemented architecture

```text
index.html + css/style.css
  View, local script loading, file/drop UI, tabs, table rendering
        |
js/app.js
  File queue, object URLs, active selection, preview, session lifecycle
        |
js/plugin-system.js
  window.MetaReaderApp, plugin registry, one ExifReader parse per buffer,
  isolated plugin calls, result validation, category aggregation and rendering
        |
plugins/*.js
  General, raster-header, AI, camera, location, and raw-data features
        |
lib/exif-reader.js + lib/image-format-reader.js
  Local metadata parser and narrow BMP/TGA header/preview support
```

`index.html` loads the core before the plugin scripts. Plugins are currently registered by their script side effects; there is no directory scan or dynamic plugin discovery. All plugins reside in the existing root `plugins/` directory. Do not move them to `js/plugins/` without a separate migration.

### File and metadata lifecycle

1. The file picker or drop zone accepts image MIME types and recognized image extensions. Selecting a new non-empty batch clears the previous session.
2. The app creates local object URLs for previews and thumbnails and revokes them when replacing the session.
3. Standard browser-supported previews use `naturalWidth` and `naturalHeight`. TGA files are decoded locally for preview only for uncompressed and RLE true-color samples supported by `ImageFormatReader`.
4. On Run, the selected file is read to an `ArrayBuffer` (TGA files are read earlier when preparing their preview). ExifReader is called once for that buffer and the parsed result is shared with plugins. The parsed result is cached per buffer object.
5. BMP/TGA header parsing is a separate, small capability. It can provide header-labelled dimensions and pixel depth; it does not imply embedded metadata support. Invalid/unreadable headers do not produce raster-header results.
6. Plugins are called in registration order, one at a time. A plugin exception is logged and isolated; successful results continue through aggregation. Newer selections or runs invalidate stale results. Switching away from an image resets its preview-readiness promise so returning to it waits for the current preview load.
7. Results are ordered by ascending numeric priority (missing priority defaults to 100). Results with the same category name are combined in that ordered sequence.

Unsupported or malformed files may still provide general file properties, but unavailable dimensions remain “Not available.” A metadata parse failure is reported in Raw Data. BMP/TGA files with readable headers identify embedded metadata extraction as unavailable; no header-derived value is presented as embedded metadata.

## Plugin registration contract

Every plugin registers one uniquely named object with `window.MetaReaderApp.registerPlugin`:

```javascript
window.MetaReaderApp.registerPlugin('ExamplePlugin', {
    supportedMimeTypes: ['image/jpeg', 'image/png'],

    execute: function(tags, fileInfo, parseError) {
        if (!tags) return null;

        return {
            categoryName: 'Example',
            priority: 40,
            data: [
                { label: 'Example property', value: tags.ExampleTag?.description ?? 'Unknown' }
            ]
        };
    }
});
```

Contract details:

- The registration name must be non-empty and unique.
- `supportedMimeTypes` must be a non-empty array. Use `'*/*'` only when the plugin can work for any input, including a failed metadata parse.
- `execute(tags, fileInfo, parseError)` may be synchronous or return a promise. `tags` is the shared ExifReader result or `undefined` if parsing failed. `fileInfo` includes `name`, `relativePath`, `size`, `type`, `lastModified`, `width`, `height`, and optional `rasterHeader`. `parseError` is the parser exception or `null`.
- Return `null` when the plugin has no output. Otherwise return `{ categoryName, priority?, data }`. Priority, when present, must be a finite number; lower values render first. Omitted priority sorts as 100.
- Each row has a string `label` and a `value` that can be rendered as text. Optional `href` values are rendered only for valid HTTP(S) URLs and opened with `noopener noreferrer`. The raw-data plugin’s search row uses `control: 'search'` and an optional text `placeholder`.
- Do not mutate `tags`, shared file information, application state, the DOM, or another plugin’s result. Build new rows and return them.
- Do not use `innerHTML` for metadata. Render values as text; use the validated `href` mechanism for links.
- Errors thrown by one plugin are logged and do not stop other plugin executions.

### Adding a plugin

1. Add `plugins/plugin-<feature>.js` and register it with the contract above.
2. Add one local `<script src="plugins/plugin-<feature>.js"></script>` to `index.html`, after `js/plugin-system.js` and alongside the existing plugin scripts. This explicit script include is the current registration mechanism; changing `app.js` or `plugin-system.js` is not required for an ordinary plugin.
3. Choose a unique category and priority. Reuse an existing category only when the plugin’s rows are intentionally part of that category.
4. Test supported and unsupported input, missing tags, and failure isolation. Run the browser regression page and do not claim formats or metadata variants that were not tested.

Core changes are appropriate only for a core defect or capability, and should remain separate from plugin-only feature work.

## Built-in plugins

| Plugin | Scope | Priority | Output |
|---|---|---:|---|
| `GeneralPropertiesPlugin` | All files | 10 | File information, dimensions and available resolution/bit-depth tags |
| `RasterHeaderPlugin` | All files with a recognized BMP/TGA header | 12 | Header-labelled format, dimensions, bit depth and encoding facts |
| `AiMetadataPlugin` | PNG, JPEG, WebP | 15 | Recognized embedded generation prompts and parameters |
| `CameraParametersPlugin` | JPEG, TIFF, WebP | 20 | Available camera and exposure fields |
| `LocationPlugin` | JPEG, TIFF, WebP | 30 | Valid GPS coordinates, altitude and an explicit Maps link |
| `RawDataDumpPlugin` | All files | 99 | Searchable ExifReader tag output and parse status |

These scopes describe the registered MIME types, not a guarantee that every file of a type contains those metadata fields.

## User interface

The dashboard uses a nominal 50/50 split, horizontal metadata tabs, a preview/drop area, optional thumbnails, and a persistent Run button. Metadata is written with safe text APIs. Image sessions clear the prior result set when a new non-empty batch is selected and when the active image changes.

## Format support and limits

- ExifReader handles the formats and metadata structures it supports; a parser failure is surfaced rather than replaced with guessed metadata.
- BMP and TGA header properties are separate from ExifReader metadata. BMP/TGA embedded metadata extraction is not supported by this application.
- TGA preview decoding is limited to 24/32-bit true-color uncompressed and RLE images. The two supplied TGA samples validate these paths. Other TGA encodings may expose a validated header but are not claimed as preview-compatible.
- AI extraction is verified only for structures present in the available samples. Midjourney and DALL-E metadata variants are not verified.
- The browser regression suite expects the current dataset of 27 general and 10 AI files. Two earlier-listed AI images are absent; see `Problems.md`.

## Regression suite

Open `test/regression.html`, select the `test/validation-samples/` directory, and choose **Run regression suite**. The page compares the selected files to a manifest of the 37 available samples, uses the actual app scripts, reads files in the browser, and does not write or alter the samples. It checks plugin registration and priority ordering, expected BMP/TGA header values, AI prompt detection, image switching, session behavior, malformed/unsupported files, plugin-failure isolation, and safe text/link rendering. Unsupported BMP/TGA embedded metadata is reported as an expected limitation, not as a passing metadata extraction.

The suite is a browser-driven manual entry point; no automated headless browser command is configured in this repository.
