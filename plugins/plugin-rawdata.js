// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin: Raw Metadata Registry Dump
 * Target Scope: All formats supported by ExifReader.
 */
window.MetaReaderApp.registerPlugin('RawDataDumpPlugin', {
    supportedMimeTypes: ['*/*'],

    execute: function(tags, fileInfo, parseError) {
        const rows = [{
            label: 'Search Tools',
            control: 'search',
            placeholder: 'Search raw tags (e.g. ISO, Date)...'
        }];

        if (parseError) {
            // Raw Data remains available even when parsing fails, with format-specific context if known.
            const rasterFormat = fileInfo && fileInfo.rasterHeader && fileInfo.rasterHeader.format;
            rows.push({
                label: 'Metadata Parsing',
                value: rasterFormat
                    ? `Embedded metadata extraction is unavailable for ${rasterFormat}; header properties may still be available. (${parseError.message})`
                    : `ExifReader could not parse metadata; the file may be corrupted or unsupported. (${parseError.message})`
            });
        }

        if (tags) {
            Object.keys(tags).sort((a, b) => a.localeCompare(b)).forEach(key => {
                const tag = tags[key];
                const value = tag && tag.description !== undefined && tag.description !== ''
                    ? tag.description
                    : tag && tag.value !== undefined
                        ? tag.value
                        : tag;
                rows.push({ label: key, value });
            });
        }

        if (rows.length === 1) {
            rows.push({
                label: 'Notice',
                value: 'No embedded EXIF or metadata markers were found.'
            });
        }

        return { categoryName: '🔍 Raw Data', priority: 99, data: rows };
    }
});
