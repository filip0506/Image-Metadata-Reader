<!-- SPDX-License-Identifier: Apache-2.0 -->

# Developer and AI Agent Guide

## What this project does

Image Metadata Reader is a browser application that reads image files selected by the user and displays available metadata. Image data stays in the browser and is processed with locally loaded scripts. The project uses plain JavaScript, HTML, and CSS: it has no build step or package-managed test runner.

Keep the core small, plugins independent, and code straightforward. Extend the existing application instead of rebuilding it.

## Read before changing code

Before making a change, read [DESIGN.md](DESIGN.md) and [Problems.md](Problems.md), then inspect the relevant implementation. This guide describes the main workflow; DESIGN.md records the fuller architecture and plugin contract, while Problems.md tracks verified limits and open issues.

## Architecture

### View

- `index.html` defines the metadata panel, image preview and drop area, thumbnail strip, and Run button.
- `css/style.css` styles the interface. The stylesheet is in `css/`; it is not at the project root.
- `index.html` loads the local libraries, core scripts, and then plugin scripts with explicit `<script>` elements.

### Core

- `js/app.js` handles file selection, image previews, thumbnails, active-image switching, session clearing, and Run actions. It protects against stale asynchronous work and revokes temporary object URLs.
- `js/plugin-system.js` provides `window.MetaReaderApp`, validates plugin registrations and results, parses metadata once per image buffer, runs applicable plugins independently, sorts and combines their results, and renders tabs and rows safely.
- `lib/image-format-reader.js` reads BMP/TGA header information and creates previews for the supported TGA encodings. It is a local format helper, not a general metadata parser.

The usual flow is: select a local image, preview it, press **Run**, parse its buffer with the local ExifReader library, pass the parsed tags and file information to applicable plugins, then display their results. Metadata values are rendered as text; supported links are restricted to HTTP(S).

### Plugins

Each file in `plugins/` handles a metadata feature and registers itself with `window.MetaReaderApp`. Plugins are loaded through explicit script references in `index.html`; there is no automatic plugin discovery.

- `plugin-general.js` — general image and file properties.
- `plugin-camera.js` — camera and photographic information.
- `plugin-location.js` — GPS coordinates and map links.
- `plugin-ai-metadata.js` — recognized AI image-generation information.
- `plugin-rawdata.js` — searchable raw metadata and parse status.
- `plugin-raster-header.js` — BMP/TGA header information.

## Adding a plugin

Create a file such as `plugins/plugin-example.js` and register one uniquely named plugin:

```javascript
window.MetaReaderApp.registerPlugin('PluginExample', {
    supportedMimeTypes: ['image/jpeg', 'image/png'],

    execute: function(tags, fileInfo, parseError) {
        if (!tags) return null;

        const rows = [];
        const value = tags.Artist?.description;

        if (value) {
            rows.push({
                label: 'Artist',
                value: value
            });
        }

        if (rows.length === 0) return null;

        return {
            categoryName: 'Example',
            priority: 40,
            data: rows
        };
    }
});
```

In this API:

- `registerPlugin()` adds the plugin under a unique name. It requires an `execute` function and a non-empty `supportedMimeTypes` array.
- `supportedMimeTypes` lists MIME types matched against the selected file. The existing `'*/*'` entry is used by plugins that apply to every file.
- `execute(tags, fileInfo, parseError)` receives shared parsed metadata (or `undefined` if parsing failed), file information, and the parse error (or `null`). Execution can be synchronous or asynchronous.
- `categoryName` is the tab name. `priority` controls ordering: lower numbers appear first; omitted priority defaults to 100.
- `data` is an array of rows, each with a string `label` and a displayable `value`.
- Return `null` when there is nothing to display. Empty data does not create a tab.

Add the plugin script to both HTML pages:

```html
<!-- In index.html, after the core scripts and with the other plugins -->
<script src="plugins/plugin-example.js"></script>
```

```html
<!-- In test/regression.html, after the core scripts and with the other plugins -->
<script src="../plugins/plugin-example.js"></script>
```

This keeps the main application and regression page loading the same plugin set. Ordinary plugin work should not require changes to `js/app.js`, `js/plugin-system.js`, or `lib/image-format-reader.js`; change core files only when a feature genuinely needs a shared core capability or fixes a core defect.

## Development workflow

1. Identify the metadata format or property to support.
2. Inspect real sample images and their metadata using the existing application and raw-data view.
3. Implement the feature in its own plugin where possible.
4. Register the plugin using the existing API.
5. Add its script to both `index.html` and `test/regression.html`.
6. Test against real images, including cases where the metadata is absent.
7. Run the complete browser regression suite.
8. Update `Problems.md` when testing confirms a limitation or discovers an issue.

## Working rules

- Read this guide, `DESIGN.md`, and `Problems.md` before changing code.
- Inspect the existing implementation before proposing architecture changes. Prefer one focused plugin change over a core change.
- Keep vanilla JavaScript and functions simple; avoid frameworks, unnecessary dependencies, and elaborate abstractions.
- Report only metadata present in the file; never invent missing values.
- Preserve safe DOM rendering. Treat metadata as untrusted text; use the existing validated link handling for links.
- Preserve session handling, object URL cleanup, cache behavior, plugin failure isolation, and protections against stale asynchronous results.
- Keep image processing local and client-side. Do not upload images or metadata or introduce remote processing.
- Preserve existing functionality and regression coverage. Keep changes in scope.
- Test changes before reporting completion. Clearly distinguish verified behavior from assumptions and unsupported cases.

### JavaScript formatting

Use braces for all conditional statements and loops, even when they contain only one statement.

Preferred:

```javascript
if (!tags) {
    return null;
}
```

Avoid:

```javascript
if (!tags) return null;
```

Keep the opening brace on the same line as the condition and the contents on separate lines. Apply this consistently to new and modified JavaScript code.


## Regression testing

Open `test/regression.html` in a browser, choose the `test/validation-samples/` directory with its folder picker, then select **Run regression suite**. The page runs the application with the same plugins, compares the selected files against its explicit manifest, and reports sample results and stability checks. It reads the original samples without modifying them.

The current baseline is **27 general samples, 10 AI samples, 37 total, and 8 stability checks**. If the validation dataset intentionally changes, update the regression manifest and related expectations to match, then run the full suite.

See `Problems.md` for current limitations. In particular, BMP/TGA header facts do not mean embedded metadata is supported; only specified TGA preview encodings have been tested. AI extraction is verified against the available samples, not unverified Midjourney or DALL-E variants.
