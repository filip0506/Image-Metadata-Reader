// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin: General Properties
 * Target Scope: All image file formats
 */
window.MetaReaderApp.registerPlugin('GeneralPropertiesPlugin', {
    supportedMimeTypes: ['*/*'],

    execute: function(tags, fileInfo) {
        if (!fileInfo) {
            return null;
        }

        const formatSize = bytes => {
            if (!Number.isFinite(bytes) || bytes < 0) {
                return 'Not available';
            }
            if (bytes >= 1048576) {
                return `${(bytes / 1048576).toFixed(2)} MB`;
            }
            if (bytes >= 1024) {
                return `${(bytes / 1024).toFixed(2)} KB`;
            }
            return `${bytes} Bytes`;
        };
        const getTag = (...names) => {
            for (const name of names) {
                const tag = tags && tags[name];
                if (!tag) {
                    continue;
                }
                const value = tag.description !== undefined && tag.description !== ''
                    ? tag.description
                    : tag.value;
                if (value !== undefined && value !== null && value !== '') {
                    return value;
                }
            }
            return null;
        };
        const formatResolution = value => {
            if (value === null) {
                return 'Not embedded';
            }
            const text = Array.isArray(value) ? value.join(', ') : String(value);
            return /dpi|dpcm|pixels/i.test(text) ? text : `${text} dpi`;
        };

        const filename = fileInfo.name || 'Unknown';
        const width = Number.isFinite(fileInfo.width) && fileInfo.width > 0
            ? fileInfo.width
            : Number(getTag('Image Width', 'ImageWidth', 'ImageWidthExifIFD')) ||
                (fileInfo.rasterHeader && fileInfo.rasterHeader.width) || null;
        const height = Number.isFinite(fileInfo.height) && fileInfo.height > 0
            ? fileInfo.height
            : Number(getTag('Image Height', 'ImageHeight', 'ImageHeightExifIFD')) ||
                (fileInfo.rasterHeader && fileInfo.rasterHeader.height) || null;
        const embeddedDate = getTag('DateTimeOriginal', 'DateTimeDigitized', 'DateTime');
        const modified = Number.isFinite(fileInfo.lastModified) && fileInfo.lastModified > 0
            ? new Date(fileInfo.lastModified).toLocaleString()
            : 'Not available';
        const embeddedBits = getTag('BitsPerSample', 'Bits Per Sample', 'Bit Depth', 'BitDepth');
        const bits = embeddedBits ?? (fileInfo.rasterHeader && fileInfo.rasterHeader.bitsPerPixel);
        const colorType = String(getTag('Color Type') || '').toLowerCase();
        // Some formats report per-channel depth, while raster headers report total pixel depth.
        const inferredComponents = /rgb.*alpha|rgba/.test(colorType) ? 4
            : /grayscale.*alpha|gray.*alpha/.test(colorType) ? 2
                : /rgb/.test(colorType) ? 3
                    : /cmyk/.test(colorType) ? 4
                        : /grayscale|gray/.test(colorType) ? 1
                            : null;
        const components = Number(getTag('Color Components')) || inferredComponents;
        let bitDepthDisplay = 'Not embedded';
        if (embeddedBits === null && fileInfo.rasterHeader) {
            bitDepthDisplay = `${bits}-bit (from ${fileInfo.rasterHeader.format} header)`;
        } else if (Array.isArray(bits)) {
            bitDepthDisplay = `${bits.reduce((total, bit) => total + (Number(bit) || 0), 0)}-bit (${bits.join(' + ')} bits per channel)`;
        } else if (bits !== null && components && components > 1) {
            bitDepthDisplay = `${(Number(bits) || 0) * components}-bit (${bits} bits × ${components} channels)`;
        } else if (bits !== null) {
            bitDepthDisplay = `${bits}-bit per channel`;
        }
        const rows = [
            { label: 'File Name', value: filename },
            { label: 'Location (File Path)', value: fileInfo.relativePath || 'Not available in browser' },
            { label: 'Created (embedded)', value: embeddedDate === null ? 'Not embedded' : embeddedDate },
            { label: 'Last Modified', value: modified },
            { label: 'File Size', value: formatSize(fileInfo.size) },
            { label: 'Dimensions', value: width && height ? `${width} × ${height} pixels` : 'Not available' },
            { label: 'Width', value: width ? `${width} pixels` : 'Not available' },
            { label: 'Height', value: height ? `${height} pixels` : 'Not available' },
            { label: 'Horizontal Resolution', value: formatResolution(getTag('XResolution')) },
            { label: 'Vertical Resolution', value: formatResolution(getTag('YResolution')) },
            { label: 'Bit Depth', value: bitDepthDisplay }
        ];

        return { categoryName: '📁 General', priority: 10, data: rows };
    }
});
