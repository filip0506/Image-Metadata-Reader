// SPDX-License-Identifier: Apache-2.0
/**
 * Lightweight header readers for image formats not parsed by ExifReader.
 * This intentionally exposes basic file-header data, not embedded metadata.
 */
(function() {
    const MAX_TGA_PIXELS = 20000000;

    function readHeader(buffer, filename) {
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 18) {
            return null;
        }
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
            return readBmpHeader(view, buffer.byteLength);
        }
        if (/\.tga$/i.test(filename || '')) {
            return readTgaHeader(view, buffer.byteLength);
        }
        return null;
    }

    function readBmpHeader(view, byteLength) {
        if (byteLength < 26) {
            return null;
        }
        // The 12-byte OS/2 DIB header stores dimensions differently from Windows headers.
        const dibSize = view.getUint32(14, true);
        let width;
        let height;
        let bitsPerPixel;
        let planes;
        let compression = 0;

        if (dibSize === 12) {
            const pixelOffset = view.getUint32(10, true);
            if (byteLength < 26 || pixelOffset < 26 || pixelOffset > byteLength) {
                return null;
            }
            width = view.getUint16(18, true);
            height = view.getUint16(20, true);
            planes = view.getUint16(22, true);
            bitsPerPixel = view.getUint16(24, true);
        } else {
            const pixelOffset = view.getUint32(10, true);
            if (dibSize < 40 || 14 + dibSize > byteLength || pixelOffset < 14 + dibSize ||
                pixelOffset > byteLength || byteLength < 34) return null;
            width = view.getInt32(18, true);
            height = Math.abs(view.getInt32(22, true));
            planes = view.getUint16(26, true);
            bitsPerPixel = view.getUint16(28, true);
            compression = view.getUint32(30, true);
        }

        if (width <= 0 || !height || planes !== 1 || ![1, 4, 8, 16, 24, 32].includes(bitsPerPixel)) {
            return null;
        }

        const compressionNames = {
            0: 'Uncompressed (BI_RGB)',
            1: 'RLE 8-bit',
            2: 'RLE 4-bit',
            3: 'Bitfields (BI_BITFIELDS)',
            4: 'Embedded JPEG',
            5: 'Embedded PNG',
            6: 'Alpha bitfields'
        };
        return {
            format: 'BMP',
            width: Math.abs(width),
            height,
            bitsPerPixel,
            compression: compressionNames[compression] || `Unknown compression (${compression})`,
            dibHeaderSize: dibSize
        };
    }

    function readTgaHeader(view, byteLength) {
        if (byteLength < 18) {
            return null;
        }
        const colorMapType = view.getUint8(1);
        const imageType = view.getUint8(2);
        const width = view.getUint16(12, true);
        const height = view.getUint16(14, true);
        const bitsPerPixel = view.getUint8(16);
        // TGA image type identifies indexed, true-color, grayscale, and their RLE variants.
        const validImageTypes = [1, 2, 3, 9, 10, 11];
        const indexed = imageType === 1 || imageType === 9;
        const trueColor = imageType === 2 || imageType === 10;
        const grayscale = imageType === 3 || imageType === 11;
        const validDepth = indexed ? [8, 16].includes(bitsPerPixel)
            : trueColor ? [15, 16, 24, 32].includes(bitsPerPixel)
                : grayscale && [8, 16].includes(bitsPerPixel);
        if (!width || !height || !validImageTypes.includes(imageType) ||
            colorMapType > 1 || !validDepth || (indexed && colorMapType !== 1) ||
            18 + view.getUint8(0) > byteLength) return null;

        return {
            format: 'TGA',
            width,
            height,
            bitsPerPixel,
            imageType,
            colorMapType,
            idLength: view.getUint8(0),
            descriptor: view.getUint8(17),
            compression: imageType === 9 || imageType === 10 || imageType === 11
                ? 'RLE'
                : 'Uncompressed'
        };
    }

    function decodeTga(buffer, header) {
        if (!header || header.format !== 'TGA') {
            throw new Error('Unsupported or invalid TGA image header.');
        }
        if (![2, 10].includes(header.imageType) || ![24, 32].includes(header.bitsPerPixel)) {
            throw new Error('This TGA image type is not supported for preview.');
        }
        if (header.colorMapType !== 0) {
            throw new Error('Color-mapped TGA previews are not supported.');
        }
        // Limit canvas allocation for unusually large or malicious dimensions.
        const pixelCount = header.width * header.height;
        if (pixelCount > MAX_TGA_PIXELS) {
            throw new Error('TGA image exceeds the safe preview size limit.');
        }

        const channels = header.bitsPerPixel / 8;
        const imageData = new Uint8ClampedArray(pixelCount * 4);
        const bytes = new Uint8Array(buffer);
        let sourceOffset = 18 + header.idLength;
        let sourcePixel = 0;
        const topOrigin = Boolean(header.descriptor & 0x20);
        const rightOrigin = Boolean(header.descriptor & 0x10);
        const hasAlpha = channels === 4 && (header.descriptor & 0x0f) > 0;

        // TGA origin bits can reverse either axis, so source order is mapped to output coordinates.
        const writePixel = pixelOffset => {
            if (pixelOffset + channels > bytes.length) {
                throw new Error('TGA pixel data is truncated.');
            }
            const row = Math.floor(sourcePixel / header.width);
            const column = sourcePixel % header.width;
            const destinationRow = topOrigin ? row : header.height - row - 1;
            const destinationColumn = rightOrigin ? header.width - column - 1 : column;
            const destination = (destinationRow * header.width + destinationColumn) * 4;

            imageData[destination] = bytes[pixelOffset + 2];
            imageData[destination + 1] = bytes[pixelOffset + 1];
            imageData[destination + 2] = bytes[pixelOffset];
            imageData[destination + 3] = hasAlpha ? bytes[pixelOffset + 3] : 255;
            sourcePixel++;
        };

        while (sourcePixel < pixelCount) {
            if (header.imageType === 2) {
                writePixel(sourceOffset);
                sourceOffset += channels;
                continue;
            }

            if (sourceOffset >= bytes.length) {
                throw new Error('TGA RLE data is truncated.');
            }
            const packet = bytes[sourceOffset++];
            const count = (packet & 0x7f) + 1;
            if (sourcePixel + count > pixelCount) {
                throw new Error('TGA RLE packet exceeds the declared image dimensions.');
            }
            if (packet & 0x80) {
                // A run-length packet stores one pixel and repeats it; raw packets store each pixel.
                const pixelOffset = sourceOffset;
                sourceOffset += channels;
                for (let index = 0; index < count; index++) {
                    writePixel(pixelOffset);
                }
            } else {
                for (let index = 0; index < count; index++) {
                    writePixel(sourceOffset);
                    sourceOffset += channels;
                }
            }
        }

        return new ImageData(imageData, header.width, header.height);
    }

    async function createTgaPreview(buffer, header) {
        const imageData = decodeTga(buffer, header);
        const canvas = document.createElement('canvas');
        canvas.width = header.width;
        canvas.height = header.height;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas is unavailable for TGA preview conversion.');
        }
        context.putImageData(imageData, 0, 0);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(result => {
                if (result) {
                    resolve(result);
                } else {
                    reject(new Error('The browser could not encode the TGA preview.'));
                }
            }, 'image/png');
        });
        return blob;
    }

    window.ImageFormatReader = { readHeader, createTgaPreview };
})();
