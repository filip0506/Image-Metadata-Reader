// SPDX-License-Identifier: Apache-2.0
(function() {
    const folderPicker = document.getElementById('validation-folder');
    const runButton = document.getElementById('run-regression');
    const report = document.getElementById('regression-report');
    const appFilePicker = document.getElementById('file-picker');
    const appRunButton = document.getElementById('btn-run-analysis');
    const preview = document.getElementById('main-preview-image');
    const tabList = document.getElementById('left-tab-list');
    const viewport = document.getElementById('tab-data-viewport');

    // Keep this manifest aligned with the supplied validation dataset; tests reject unexpected files.
    const expectedSamples = [
        'Alpha Lossless (1).webp',
        'Alpha Lossy (1).webp',
        'Android Depth Map.jpg',
        'Animation Lossless.webp',
        'BUMPMAP1.TGA',
        'Canon EOS 20D (1).jpg',
        'Canon EOS 20D (2).jpg',
        'Canon EOS 30D (4).jpg',
        'Canon EOS 100D.jpg',
        'Canon PowerShot A85.jpg',
        'FujiFilm FinePix X100.jpg',
        'HTC Desire.webp',
        'Issue 201.gif',
        'Issue 211.jpg',
        'Issue 316 (dotnet).png',
        'Kodak PIXPRO AZ521.jpg',
        'Nikon Coolpix P7000.webp',
        'Nikon D1X.webp',
        'Photo (1).webp',
        'QDb.BMP',
        'gimp-8x12-greyscale-alpha-time-background.png',
        'mspaint-10x10.gif',
        'pbar-ani-invalid-XMP.gif',
        'photoshop-8x12-32colors-alpha.gif',
        'photoshop-8x12-rgb24-interlaced.png',
        'simple_b_rock1_0.tga',
        'webpvp8.webp',
        'AI/25b8a18c3f43a62c6ea5dac37fa031ac.jpg',
        'AI/263b5281bb7b1041b41f77b79a6debe8.jpg',
        'AI/5c6779c1f97bdf261fd6fb2ae89b4555.png',
        'AI/6340283f4a373afbfd7f0916d348c1c0.png',
        'AI/674765987c344faa8a91724e08a021f7.png',
        'AI/8affe2a4023ccb35318cb7a25e0d9a1c.png',
        'AI/9f18a0f74a05875d364d88711b44fbf5.png',
        'AI/b564513d92c5c0ebec42723ca4091d68.png',
        'AI/c8eca4f0ce6dd7c751d0f3651e601e6c.png',
        'AI/edcc126e2024f129386f3d9bbcc88c7e.png'
    ];
    const missingHistoricalSamples = [
        '21d56cc7ae531d7e8697ed3df9f47cfb.png',
        '6a1ebdacf028844fe7dbda327d665d5d.jpg'
    ];

    folderPicker.addEventListener('change', () => {
        runButton.disabled = folderPicker.files.length === 0;
    });
    runButton.addEventListener('click', runSuite);

    async function runSuite() {
        runButton.disabled = true;
        const files = Array.from(folderPicker.files).filter(isImageFile);
        const generalFiles = files.filter(file => !isAiSample(file));
        const aiFiles = files.filter(isAiSample);
        const passed = [];
        const failed = [];
        const check = async (name, test) => {
            try {
                await test();
                passed.push(name);
            } catch (error) {
                failed.push(`${name}: ${error.message}`);
            }
            showProgress(files.length, passed, failed);
        };

        report.textContent = `Checking ${files.length} selected images...`;
        try {
            await check('Validation sample manifest', () => verifySampleManifest(files));
            await check('Stability: Plugin registration contract', verifyPluginRegistry);

            for (const file of files) {
                await check(`Sample: ${relativeName(file)}`, () => testSample(file));
            }

            // Synthetic malformed files below are created in memory and never alter sample images.
            const stabilityTests = [
                ['Multi-image switching and session replacement', () =>
                    testImageSwitching(generalFiles[0], aiFiles[0])],
                ['Empty selection preserves the active session', () =>
                    testEmptySelection(aiFiles[0])],
                ['Plugin exceptions are isolated', () =>
                    testPluginFailure(generalFiles[0])],
                ['Metadata and unsafe URLs render safely', () =>
                    testSafeRendering(generalFiles[0])],
                ['Malformed BMP does not invent dimensions', () =>
                    testInvalidImage(new File([new Uint8Array([0x42, 0x4d])],
                        'malformed.bmp', { type: 'image/bmp' }))],
                ['Malformed TGA fails gracefully', () =>
                    testInvalidImage(new File([new Uint8Array(18)],
                        'malformed.tga', { type: 'image/x-tga' }))],
                ['Unsupported image type fails clearly', () =>
                    testInvalidImage(new File(['not an image'],
                        'unsupported.unknown', { type: 'image/x-unknown' }))]
            ];
            for (const [name, test] of stabilityTests) {
                await check(`Stability: ${name}`, test);
            }
        } finally {
            showFinalReport(files, passed, failed);
            runButton.disabled = false;
        }
    }

    function verifySampleManifest(files) {
        const generalCount = files.filter(file => !isAiSample(file)).length;
        const aiCount = files.filter(isAiSample).length;
        const actual = new Set(files.map(samplePath));
        const expected = new Set(expectedSamples.map(path => path.toLowerCase()));
        const missing = [...expected].filter(path => !actual.has(path));
        const unexpected = [...actual].filter(path => !expected.has(path));

        assert(generalCount === 27, `Expected 27 general samples; found ${generalCount}.`);
        assert(aiCount === 10, `Expected 10 AI samples; found ${aiCount}.`);
        assert(!missing.length && !unexpected.length,
            `Manifest mismatch. Missing: ${missing.join(', ') || 'none'}; ` +
            `unexpected: ${unexpected.join(', ') || 'none'}.`);
    }

    function verifyPluginRegistry() {
        const plugins = Object.entries(window.MetaReaderApp.plugins);
        assert(plugins.length === 6, `Expected 6 built-in plugins; found ${plugins.length}.`);
        plugins.forEach(([name, plugin]) => {
            assert(name.trim(), 'A plugin has an empty name.');
            assert(Array.isArray(plugin.supportedMimeTypes) &&
                plugin.supportedMimeTypes.length > 0 &&
                plugin.supportedMimeTypes.every(type => typeof type === 'string' && type.trim()),
            `${name} has invalid MIME types.`);
            assert(typeof plugin.execute === 'function', `${name} has no execute function.`);
        });

        let duplicateRejected = false;
        try {
            window.MetaReaderApp.registerPlugin(plugins[0][0], plugins[0][1]);
        } catch (error) {
            duplicateRejected = true;
        }
        assert(duplicateRejected, 'The registry accepted a duplicate plugin name.');
    }

    async function testSample(file) {
        await selectFiles([file]);
        const previewLoaded = await waitForPreview(file);
        await runAnalysis();

        const tabs = tabNames();
        assert(hasTab('General'), 'General tab is missing.');
        assert(hasTab('Raw Data'), 'Raw Data tab is missing.');
        assert(hasTab('AI Generation') === isAiSample(file),
            'AI detection does not match the sample folder.');

        clickTab('General');
        const dimensions = rowValue('Dimensions');
        assert(dimensions && !dimensions.includes('Not available'),
            'Image dimensions are missing.');
        assertExpectedDimensions(file, dimensions);

        if (/\.(bmp|tga)$/i.test(file.name)) {
            testRasterHeader(file);
            testExpectedParseFailure(file);
        }
        if (/\.tga$/i.test(file.name)) {
            assert(previewLoaded, 'TGA preview did not decode.');
            assert(preview.naturalWidth > 0 && preview.naturalHeight > 0,
                'TGA preview has no decoded dimensions.');
        }
        if (isAiSample(file)) {
            clickTab('AI Generation');
            assert(rowValue('AI Generator Engine'), 'AI engine is missing.');
            assert(rowValue('Positive Prompt'), 'Positive prompt is missing.');
        }
    }

    function testRasterHeader(file) {
        assert(hasTab('Raster Header'), 'Raster Header tab is missing.');
        clickTab('Raster Header');
        const expected = {
            'QDb.BMP': { format: 'BMP', depth: '4-bit' },
            'BUMPMAP1.TGA': { format: 'TGA', depth: '24-bit' },
            'simple_b_rock1_0.tga': { format: 'TGA', depth: '32-bit' }
        }[file.name];
        if (!expected) {
            return;
        }
        assert(rowValue('Format') === expected.format, 'Raster format is incorrect.');
        assert(rowValue('Bit Depth (file header)') === expected.depth,
            'Header bit depth is incorrect.');
    }

    function testExpectedParseFailure(file) {
        clickTab('Raw Data');
        const format = /\.bmp$/i.test(file.name) ? 'BMP' : 'TGA';
        const status = rowValue('Metadata Parsing');
        assert(status && status.includes(
            `Embedded metadata extraction is unavailable for ${format}`),
        'Expected unsupported embedded metadata to be clearly reported.');
    }

    async function testImageSwitching(generalFile, aiFile) {
        assert(generalFile && aiFile, 'General and AI samples are required.');
        await selectFiles([generalFile, aiFile]);
        document.querySelectorAll('.thumb-wrapper')[1].click();
        document.querySelectorAll('.thumb-wrapper')[0].click();
        await runAnalysis();
        assert(hasTab('General'), 'The image readiness state was not recreated after switching.');
        assert(rowValue('File Name') === generalFile.name,
            'The newly selected general image was not analyzed.');

        const thumbnails = document.querySelectorAll('.thumb-wrapper');
        assert(thumbnails.length === 2, 'Multiple image thumbnails were not rendered.');
        thumbnails[1].click();
        assert(tabNames().length === 0, 'Previous metadata remained after switching.');
        assert(viewport.textContent.includes('No analysis executed yet'),
            'The metadata table did not clear after switching.');

        thumbnails[0].click();
        thumbnails[1].click();
        await runAnalysis();
        assert(hasTab('AI Generation'), 'The newly selected AI image was not analyzed.');
        clickTab('General');
        assert(rowValue('File Name') === aiFile.name,
            'Rapid switching left the wrong image selected.');
    }

    async function testEmptySelection(aiFile) {
        assert(aiFile, 'An AI sample is required.');
        await selectFiles([aiFile]);
        await runAnalysis();
        const before = tabNames().join('|');

        appFilePicker.files = new DataTransfer().files;
        appFilePicker.dispatchEvent(new Event('change', { bubbles: true }));
        assert(tabNames().join('|') === before, 'Empty selection cleared the current session.');
        assert(rowValueFromTab('General', 'File Name') === aiFile.name,
            'Empty selection changed the active image.');
    }

    async function testPluginFailure(file) {
        assert(file, 'A general sample is required.');
        const name = 'RegressionThrowingPlugin';
        window.MetaReaderApp.registerPlugin(name, {
            supportedMimeTypes: ['*/*'],
            execute: function() {
                throw new Error('Intentional regression fault.');
            }
        });
        try {
            await selectFiles([file]);
            await runAnalysis();
            assert(hasTab('General'), 'General plugin did not run after the failure.');
            assert(hasTab('Raw Data'), 'Raw Data plugin did not run after the failure.');
        } finally {
            delete window.MetaReaderApp.plugins[name];
        }
    }

    async function testSafeRendering(file) {
        assert(file, 'A general sample is required.');
        const name = 'RegressionUnsafeTextPlugin';
        const marker = '<img src=x onerror=alert(1)>';
        window.MetaReaderApp.registerPlugin(name, {
            supportedMimeTypes: ['*/*'],
            execute: function() {
                return {
                    categoryName: 'Regression Safety',
                    priority: 1,
                    data: [
                        { label: 'Metadata text', value: marker },
                        { label: 'Unsafe URL', value: 'blocked', href: 'javascript:alert(1)' }
                    ]
                };
            }
        });
        try {
            await selectFiles([file]);
            await runAnalysis();
            assert(tabNames()[0].includes('Regression Safety'),
                'Results were not sorted by ascending priority.');
            clickTab('Regression Safety');
            assert(viewport.querySelector('img') === null,
                'Metadata text created an HTML element.');
            assert(viewport.textContent.includes(marker),
                'Metadata text was not rendered literally.');
            const unsafeLink = [...viewport.querySelectorAll('tbody tr')]
                .find(row => row.cells[0].textContent === 'Unsafe URL');
            assert(unsafeLink && !unsafeLink.cells[1].querySelector('a'),
                'An unsafe URL was rendered as a link.');
        } finally {
            delete window.MetaReaderApp.plugins[name];
        }
    }

    async function testInvalidImage(file) {
        await selectFiles([file]);
        await waitFor(() => document.getElementById('upload-placeholder').textContent
            .includes(`Preview unavailable for ${file.name}`), 5000);
        await runAnalysis();

        clickTab('General');
        assert(rowValue('Dimensions') === 'Not available',
            'Dimensions were reported for an invalid image.');
        clickTab('Raw Data');
        const status = rowValue('Metadata Parsing');
        assert(status && status.includes('file may be corrupted or unsupported'),
            'The parse failure message is unclear.');
        if (/\.tga$/i.test(file.name)) {
            assert(!hasTab('Raster Header'), 'A raster header was reported for invalid TGA.');
        }
    }

    async function selectFiles(files) {
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        appFilePicker.files = transfer.files;
        appFilePicker.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => !appRunButton.disabled, 5000);
    }

    async function runAnalysis() {
        appRunButton.click();
        await waitFor(() => !appRunButton.disabled &&
            appRunButton.textContent.includes('RUN METADATA READER'), 15000);
    }

    async function waitForPreview(file) {
        const placeholder = document.getElementById('upload-placeholder');
        const isTga = /\.tga$/i.test(file.name);
        await waitFor(() => {
            const unavailable = placeholder.textContent.includes(
                `Preview unavailable for ${file.name}`);
            const loaded = placeholder.style.display === 'none' &&
                preview.complete && preview.naturalWidth > 0;
            return isTga ? loaded : loaded || unavailable;
        }, isTga ? 10000 : 5000);
        return preview.complete && preview.naturalWidth > 0 &&
            placeholder.style.display === 'none';
    }

    function assertExpectedDimensions(file, actual) {
        const expected = {
            'QDb.BMP': '82 × 112 pixels',
            'BUMPMAP1.TGA': '150 × 150 pixels',
            'simple_b_rock1_0.tga': '128 × 128 pixels'
        }[file.name];
        if (expected) {
            assert(actual === expected, `Expected ${expected}; found ${actual}.`);
        }
    }

    function tabNames() {
        return [...tabList.querySelectorAll('.tab-btn')].map(button => button.textContent);
    }

    function hasTab(name) {
        return tabNames().some(tab => tab.includes(name));
    }

    function clickTab(name) {
        const button = [...tabList.querySelectorAll('.tab-btn')]
            .find(candidate => candidate.textContent.includes(name));
        assert(button, `${name} tab is missing.`);
        button.click();
    }

    function rowValue(label) {
        const row = [...viewport.querySelectorAll('tbody tr')]
            .find(candidate => candidate.cells[0].textContent.trim() === label);
        return row && row.cells[1].textContent.trim();
    }

    function rowValueFromTab(tab, label) {
        clickTab(tab);
        return rowValue(label);
    }

    function isAiSample(file) {
        return /(?:^|\/)ai\//i.test(file.webkitRelativePath || '');
    }

    function isImageFile(file) {
        return file.type.startsWith('image/') ||
            /\.(avif|bmp|gif|heic|heif|jpe?g|png|tga|tiff?|webp)$/i.test(file.name);
    }

    function relativeName(file) {
        return file.webkitRelativePath || file.name;
    }

    function samplePath(file) {
        return relativeName(file)
            .replace(/^.*?validation-samples[\\/]/i, '')
            .replace(/\\/g, '/')
            .toLowerCase();
    }

    function assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    async function waitFor(predicate, timeoutMs) {
        const startedAt = Date.now();
        while (!predicate()) {
            if (Date.now() - startedAt >= timeoutMs) {
                throw new Error('Timed out waiting for the application.');
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    function showProgress(sampleCount, passed, failed) {
        report.textContent = `Progress: ${passed.length + failed.length} checks; ` +
            `${sampleCount} selected samples.\n` +
            (failed.length ? `Failures:\n${failed.join('\n')}` : 'No failures so far.');
    }

    function showFinalReport(files, passed, failed) {
        const sampleChecks = passed.filter(name => name.startsWith('Sample: ')).length;
        const stabilityChecks = passed.filter(name => name.startsWith('Stability: ')).length;
        const absent = missingHistoricalSamples.filter(name =>
            !files.some(file => file.name.toLowerCase() === name.toLowerCase()));
        const summary = failed.length
            ? `FAILED: ${failed.length} check(s); ${sampleChecks}/${files.length} samples passed.`
            : `PASSED: ${sampleChecks} samples and ${stabilityChecks} stability checks.`;
        report.textContent = `${summary}\n` +
            `Expected unsupported embedded metadata: ${files.filter(file =>
                /\.(bmp|tga)$/i.test(file.name)).length} BMP/TGA samples (header properties tested separately).\n` +
            `Not present in the supplied folder: ${absent.join(', ') || 'none'}\n` +
            (failed.length ? `Failures:\n${failed.join('\n')}` : 'All checks passed.');
    }
})();
