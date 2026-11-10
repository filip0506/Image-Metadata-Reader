<!-- SPDX-License-Identifier: Apache-2.0 -->

# Known Problems and Verification Status

## Resolved and verified

- **Metadata rendering safety:** Metadata values render as text. External links are accepted only for HTTP(S) and use `noopener noreferrer`. The regression suite injects HTML-like text and a `javascript:` URL and verifies neither is executed/rendered as active markup.
- **Plugin failure isolation:** A deliberately throwing regression plugin does not prevent the General or Raw Data plugins from returning results. Plugin failures are reported to the browser console.
- **Session correctness:** Sequential replacement, a two-image selection, switching away and back before preview completion, rapid thumbnail switching, and an empty file selection are covered. Switching resets the image's readiness promise, a new non-empty selection clears prior metadata, and an empty selection is a no-op that preserves the current session.
- **BMP/TGA header properties:** Validated headers provide labelled dimensions and pixel depth. The supplied values are checked exactly: `QDb.BMP` 82×112/4-bit, `BUMPMAP1.TGA` 150×150/24-bit, and `simple_b_rock1_0.tga` 128×128/32-bit.
- **TGA previews:** The supplied 24-bit uncompressed true-color and 32-bit RLE true-color samples preview successfully. Malformed TGA preview/header failures remain visible and do not produce dimensions.
- **AI false positives and available samples:** All 27 general samples and 10 available AI samples are checked. The general set produces no AI tab; all current AI samples produce a positive prompt.
- **Repeatable browser regression:** `test/regression.html` compares the selected directory against a manifest of all 37 available sample paths and reads the files without writing to them. It checks BMP/TGA expectations, AI prompts, session lifecycle, malformed/unsupported input, plugin registration, failure isolation, priority order, and safe rendering. The complete suite passed twice consecutively after the final changes in the current browser.
- **AI engine label:** A1111-style parameter text containing `Version: ComfyUI` is labelled Stable Diffusion (ComfyUI), and unknown parameter fields are preserved.

## Still open or not verified

- **AI metadata compatibility:** Available samples verify only the represented A1111/Stable Diffusion, ComfyUI, NovelAI, and embedded-parameter structures. Midjourney and DALL-E metadata variants are not verified; no engine-specific support is claimed for them.
- **BMP/TGA embedded metadata:** ExifReader rejects all three supplied BMP/TGA samples. Header properties and tested TGA previews do not provide embedded EXIF/XMP extraction.
- **Other TGA encodings:** Preview decoding is intentionally limited to the tested 24/32-bit true-color uncompressed and RLE variants. Palette, grayscale, 15/16-bit true-color, and other TGA variants are not preview-verified.
- **Browser/test automation:** The regression suite is a browser page that requires selecting the validation directory. It has no automated headless runner and has only been verified in the current integrated browser.
- **Other image format variants:** Browser preview and ExifReader metadata support vary by browser and file encoding. A supported filename or MIME type does not guarantee embedded metadata or preview availability.

Expected ExifReader errors for BMP/TGA and the deliberate plugin-failure test appear in the browser console during regression runs. They are expected test conditions, not suite failures.
