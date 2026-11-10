// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin: Basic BMP/TGA Raster Header
 * Reports dimensions and encoding details from the file header only.
 */
window.MetaReaderApp.registerPlugin('RasterHeaderPlugin', {
    supportedMimeTypes: ['*/*'],

    execute: function(tags, fileInfo) {
        const header = fileInfo && fileInfo.rasterHeader;
        if (!header) {
            return null;
        }

        const rows = [
            { label: 'Format', value: header.format },
            { label: 'Dimensions (file header)', value: `${header.width} × ${header.height} pixels` },
            { label: 'Bit Depth (file header)', value: `${header.bitsPerPixel}-bit` }
        ];
        if (header.format === 'BMP') {
            rows.push(
                { label: 'Compression', value: header.compression },
                { label: 'DIB Header Size', value: `${header.dibHeaderSize} bytes` }
            );
        } else {
            const imageTypes = {
                2: 'True-color',
                3: 'Grayscale',
                10: 'RLE true-color',
                11: 'RLE grayscale'
            };
            rows.push(
                { label: 'Image Type', value: imageTypes[header.imageType] || `Type ${header.imageType}` },
                { label: 'Color Map Type', value: header.colorMapType },
                { label: 'Compression', value: header.compression }
            );
        }

        return { categoryName: '🧱 Raster Header', priority: 12, data: rows };
    }
});
