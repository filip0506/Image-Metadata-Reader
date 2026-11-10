// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin: Camera Parameters
 * Target Scope: Images containing camera metadata.
 */
window.MetaReaderApp.registerPlugin('CameraParametersPlugin', {
    supportedMimeTypes: ['image/jpeg', 'image/tiff', 'image/webp'],

    execute: function(tags) {
        if (!tags) {
            return null;
        }

        const getValue = (...names) => {
            for (const name of names) {
                const tag = tags[name];
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
        const rows = [];
        const add = (label, value) => {
            if (value !== null) {
                rows.push({ label, value });
            }
        };

        add('Camera Manufacturer', getValue('Make', 'CameraMake'));
        add('Camera Model', getValue('Model', 'CameraModel'));
        add('Lens Model', getValue('LensModel', 'Lens'));
        add('Aperture', getValue('FNumber', 'ApertureValue'));
        const shutter = getValue('ExposureTime', 'ShutterSpeedValue');
        if (shutter !== null) {
            const text = String(shutter);
            add('Shutter Speed', /sec|s$/i.test(text) ? text : `${text} sec`);
        }
        add('ISO Speed', getValue('ISOSpeedRatings', 'PhotographicSensitivity', 'ISO'));
        add('Date Taken', getValue('DateTimeOriginal', 'DateTimeDigitized'));

        return rows.length
            ? { categoryName: '📸 Camera Data', priority: 20, data: rows }
            : null;
    }
});
