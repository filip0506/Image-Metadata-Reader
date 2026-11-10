// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin: Geolocation Coordinates
 * Target Scope: Images containing valid embedded GPS coordinates.
 */
window.MetaReaderApp.registerPlugin('LocationPlugin', {
    supportedMimeTypes: ['image/jpeg', 'image/webp', 'image/tiff'],

    execute: function(tags) {
        if (!tags) {
            return null;
        }

        const latitude = tags.GPSLatitude;
        const longitude = tags.GPSLongitude;
        if (!latitude || !longitude) {
            return null;
        }

        const numeric = value => {
            if (typeof value === 'number') {
                return value;
            }
            if (Array.isArray(value) && value.length === 2) {
                const numerator = numeric(value[0]);
                const denominator = numeric(value[1]);
                return numerator !== null && denominator
                    ? numerator / denominator
                    : null;
            }
            if (value && typeof value === 'object') {
                if (Number.isFinite(value.numerator) && Number.isFinite(value.denominator) &&
                    value.denominator !== 0) {
                    return value.numerator / value.denominator;
                }
                if (value.value !== undefined) {
                    return numeric(value.value);
                }
            }
            const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        };
        const coordinate = tag => {
            if (!tag || typeof tag !== 'object') {
                return numeric(tag);
            }
            const description = tag.description;
            if (typeof description === 'number' && Number.isFinite(description)) {
                return description;
            }
            if (typeof description === 'string') {
                const decimal = Number(description);
                if (Number.isFinite(decimal)) {
                    return decimal;
                }
                const parts = description.match(/-?\d+(?:\.\d+)?/g);
                if (parts && parts.length >= 3) {
                    // ExifReader may expose DMS text; convert degrees, minutes, and seconds to decimal.
                    return Math.abs(Number(parts[0])) + Number(parts[1]) / 60 + Number(parts[2]) / 3600;
                }
            }
            const values = Array.isArray(tag.value) ? tag.value : [tag.value];
            const parts = values.map(numeric);
            if (!parts.length || parts.some(value => value === null)) {
                return null;
            }
            if (parts.length === 1) {
                return parts[0];
            }
            return Math.abs(parts[0]) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
        };
        const reference = tag => {
            if (typeof tag === 'string') {
                return tag.trim().toUpperCase();
            }
            const value = tag && (tag.description !== undefined ? tag.description : tag.value);
            return value === undefined || value === null ? '' : String(value).trim().toUpperCase();
        };
        const isWestOrSouth = value => /(^|[^A-Z])(S|SOUTH|W|WEST)([^A-Z]|$)/.test(value);

        let lat = coordinate(latitude);
        let lon = coordinate(longitude);
        if (lat === null || lon === null) {
            return null;
        }
        const latRef = reference(tags.GPSLatitudeRef);
        const lonRef = reference(tags.GPSLongitudeRef);
        // GPS references carry hemisphere; apply the sign after converting the coordinate magnitude.
        if (isWestOrSouth(latRef)) {
            lat = -Math.abs(lat);
        }
        if (isWestOrSouth(lonRef)) {
            lon = -Math.abs(lon);
        }
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            return null;
        }

        const rows = [
            { label: 'Latitude', value: `${lat.toFixed(6)}°${latRef ? ` (${latRef})` : ''}` },
            { label: 'Longitude', value: `${lon.toFixed(6)}°${lonRef ? ` (${lonRef})` : ''}` }
        ];
        if (tags.GPSAltitude) {
            const altitudeTag = tags.GPSAltitude;
            const altitude = numeric(typeof altitudeTag === 'object'
                ? altitudeTag.description ?? altitudeTag.value
                : altitudeTag);
            if (altitude !== null) {
                const altitudeRefTag = tags.GPSAltitudeRef;
                const altitudeRef = numeric(typeof altitudeRefTag === 'object'
                    ? altitudeRefTag.value ?? altitudeRefTag.description
                    : altitudeRefTag);
                const signedAltitude = altitudeRef === 1 ? -Math.abs(altitude) : altitude;
                rows.push({ label: 'Altitude', value: `${signedAltitude.toFixed(1)} meters` });
            }
        }

        const mapsUrl = new URL('https://www.google.com/maps/search/');
        mapsUrl.searchParams.set('api', '1');
        mapsUrl.searchParams.set('query', `${lat.toFixed(6)},${lon.toFixed(6)}`);
        rows.push({ label: 'Map Position', value: 'View on Google Maps', href: mapsUrl.href });

        return { categoryName: '📍 Location', priority: 30, data: rows };
    }
});
