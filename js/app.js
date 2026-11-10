// SPDX-License-Identifier: Apache-2.0
/**
 * Core Application Manager
 * Coordinates file ingestion, image selection, and metadata pipeline execution.
 */
(function() {
    const state = {
        queue: [],
        activeIndex: -1,
        // These counters make work started for an older session or run stale.
        sessionId: 0,
        analysisId: 0
    };

    const DOM = {
        dropZone: document.getElementById('drop-zone'),
        filePicker: document.getElementById('file-picker'),
        uploadPlaceholder: document.getElementById('upload-placeholder'),
        mainPreviewImage: document.getElementById('main-preview-image'),
        thumbnailStrip: document.getElementById('thumbnail-strip'),
        btnRunAnalysis: document.getElementById('btn-run-analysis')
    };

    function initEvents() {
        DOM.filePicker.addEventListener('change', event => {
            if (event.target.files.length) {
                processFiles(event.target.files);
            }
            event.target.value = '';
        });

        DOM.dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            DOM.dropZone.classList.add('drag-over');
        });
        DOM.dropZone.addEventListener('dragleave', () => DOM.dropZone.classList.remove('drag-over'));
        DOM.dropZone.addEventListener('drop', event => {
            event.preventDefault();
            DOM.dropZone.classList.remove('drag-over');
            if (event.dataTransfer.files.length) {
                processFiles(event.dataTransfer.files);
            }
        });
        DOM.btnRunAnalysis.addEventListener('click', executeAnalysisPipeline);
    }

    function processFiles(fileList) {
        clearSession();
        const files = Array.from(fileList).filter(isImageFile);

        files.forEach(file => {
            const item = {
                file,
                // TGA previews may replace this URL with a locally decoded PNG.
                objectUrl: URL.createObjectURL(file),
                previewUrl: null,
                arrayBuffer: null,
                arrayBufferPromise: null,
                rasterHeader: null,
                width: null,
                height: null,
                imageReady: null,
                thumbnailImage: null
            };
            item.previewUrl = item.objectUrl;
            state.queue.push(item);
            if (/\.tga$/i.test(file.name)) {
                prepareTgaPreview(item, state.sessionId);
            }
        });

        if (!state.queue.length) {
            setPlaceholder('No supported image files were selected.');
            return;
        }

        state.activeIndex = 0;
        renderWorkspaceViews();
    }

    function isImageFile(file) {
        if (file.type && file.type.startsWith('image/')) {
            return true;
        }
        return /\.(avif|bmp|gif|heic|heif|jpe?g|png|tga|tiff?|webp)$/i.test(file.name);
    }

    function clearSession() {
        state.sessionId++;
        state.analysisId++;
        state.queue.forEach(item => {
            resetImageReady(item);
            URL.revokeObjectURL(item.objectUrl);
            if (item.previewUrl && item.previewUrl !== item.objectUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        state.queue = [];
        state.activeIndex = -1;

        DOM.mainPreviewImage.onload = null;
        DOM.mainPreviewImage.onerror = null;
        DOM.mainPreviewImage.removeAttribute('src');
        DOM.mainPreviewImage.style.display = 'none';
        DOM.thumbnailStrip.replaceChildren();
        DOM.thumbnailStrip.style.display = 'none';
        DOM.btnRunAnalysis.disabled = true;
        DOM.btnRunAnalysis.textContent = '▶ RUN METADATA READER';
        setPlaceholder('Drag & Drop Images Here or Click to Browse');
        window.MetaReaderApp.clearDashboardUI();
    }

    function setPlaceholder(message) {
        const paragraph = DOM.uploadPlaceholder.querySelector('p');
        if (paragraph) {
            paragraph.textContent = message;
        }
        DOM.uploadPlaceholder.style.display = 'block';
    }

    function renderWorkspaceViews() {
        if (state.activeIndex < 0 || !state.queue[state.activeIndex]) {
            DOM.btnRunAnalysis.disabled = true;
            return;
        }

        const item = state.queue[state.activeIndex];
        DOM.mainPreviewImage.onload = () => {
            if (state.queue[state.activeIndex] !== item) {
                return;
            }
            item.width = DOM.mainPreviewImage.naturalWidth;
            item.height = DOM.mainPreviewImage.naturalHeight;
            item.resolveImageReady();
            DOM.uploadPlaceholder.style.display = 'none';
            DOM.mainPreviewImage.style.display = 'block';
        };
        DOM.mainPreviewImage.onerror = () => {
            if (state.queue[state.activeIndex] !== item) {
                return;
            }
            item.resolveImageReady();
            DOM.mainPreviewImage.style.display = 'none';
            setPlaceholder(`Preview unavailable for ${item.file.name}; metadata can still be checked.`);
        };
        // Running analysis waits for the preview so browser dimensions are ready.
        if (!item.imageReady) {
            item.imageReady = new Promise(resolve => {
                item.resolveImageReady = resolve;
            });
        }
        DOM.mainPreviewImage.style.display = 'none';
        setPlaceholder(`Loading ${item.file.name}...`);
        DOM.mainPreviewImage.src = item.previewUrl;

        DOM.thumbnailStrip.replaceChildren();
        DOM.thumbnailStrip.style.display = state.queue.length > 1 ? 'flex' : 'none';
        state.queue.forEach((image, index) => {
            const wrapper = document.createElement('button');
            wrapper.type = 'button';
            wrapper.className = `thumb-wrapper${index === state.activeIndex ? ' is-active' : ''}`;
            wrapper.setAttribute('aria-label', `Select image ${index + 1}: ${image.file.name}`);
            const thumbnail = document.createElement('img');
            thumbnail.src = image.previewUrl;
            thumbnail.alt = '';
            image.thumbnailImage = thumbnail;
            wrapper.appendChild(thumbnail);
            wrapper.addEventListener('click', () => switchActiveImage(index));
            DOM.thumbnailStrip.appendChild(wrapper);
        });

        DOM.btnRunAnalysis.disabled = false;
    }

    async function prepareTgaPreview(item, sessionId) {
        try {
            item.arrayBuffer = await getArrayBuffer(item);
            // Ignore decode results if another file selection replaced this session.
            if (sessionId !== state.sessionId || !state.queue.includes(item)) {
                return;
            }

            item.rasterHeader = window.ImageFormatReader.readHeader(item.arrayBuffer, item.file.name);
            if (!item.rasterHeader) {
                throw new Error('The TGA header is invalid or unreadable.');
            }
            const previewBlob = await window.ImageFormatReader.createTgaPreview(
                item.arrayBuffer,
                item.rasterHeader
            );
            if (sessionId !== state.sessionId || !state.queue.includes(item)) {
                return;
            }

            if (item.previewUrl !== item.objectUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
            item.previewUrl = URL.createObjectURL(previewBlob);
            if (item.thumbnailImage) {
                item.thumbnailImage.src = item.previewUrl;
            }
            if (state.queue[state.activeIndex] === item) {
                renderWorkspaceViews();
            }
        } catch (error) {
            if (sessionId !== state.sessionId || !state.queue.includes(item)) {
                return;
            }
            console.error(`Unable to create a TGA preview for "${item.file.name}":`, error);
            if (state.queue[state.activeIndex] === item) {
                DOM.mainPreviewImage.style.display = 'none';
                setPlaceholder(`Preview unavailable for ${item.file.name}: ${error.message}`);
            }
        }
    }

    async function getArrayBuffer(item) {
        if (item.arrayBuffer) {
            return item.arrayBuffer;
        }
        if (!item.arrayBufferPromise) {
            item.arrayBufferPromise = item.file.arrayBuffer();
        }
        item.arrayBuffer = await item.arrayBufferPromise;
        return item.arrayBuffer;
    }

    function resetImageReady(item) {
        // Returning to this image creates a new promise for its next preview load.
        if (item.resolveImageReady) {
            item.resolveImageReady();
        }
        item.resolveImageReady = null;
        item.imageReady = null;
    }

    function switchActiveImage(targetIndex) {
        if (targetIndex === state.activeIndex || !state.queue[targetIndex]) {
            return;
        }
        const previousItem = state.queue[state.activeIndex];
        if (previousItem) {
            resetImageReady(previousItem);
        }
        state.activeIndex = targetIndex;
        state.analysisId++;
        window.MetaReaderApp.clearDashboardUI();
        renderWorkspaceViews();
    }

    async function executeAnalysisPipeline() {
        const activeItem = state.queue[state.activeIndex];
        if (!activeItem || DOM.btnRunAnalysis.disabled) {
            return;
        }

        const sessionId = state.sessionId;
        const analysisId = ++state.analysisId;
        const isCurrent = () => sessionId === state.sessionId &&
            analysisId === state.analysisId &&
            state.queue[state.activeIndex] === activeItem;

        DOM.btnRunAnalysis.disabled = true;
        DOM.btnRunAnalysis.textContent = 'PARSING METADATA...';
        try {
            if (activeItem.imageReady) {
                await activeItem.imageReady;
            }
            if (!isCurrent()) {
                return;
            }
            activeItem.arrayBuffer = await getArrayBuffer(activeItem);
            if (!isCurrent()) {
                return;
            }
            activeItem.rasterHeader = activeItem.rasterHeader ||
                window.ImageFormatReader.readHeader(activeItem.arrayBuffer, activeItem.file.name);

            const fileInfo = {
                name: activeItem.file.name,
                relativePath: activeItem.file.webkitRelativePath || '',
                size: activeItem.file.size,
                type: activeItem.file.type || mimeTypeFromName(activeItem.file.name),
                lastModified: activeItem.file.lastModified || null,
                width: activeItem.width || (activeItem.rasterHeader && activeItem.rasterHeader.width),
                height: activeItem.height || (activeItem.rasterHeader && activeItem.rasterHeader.height),
                rasterHeader: activeItem.rasterHeader
            };
            await window.MetaReaderApp.runPipeline(activeItem.arrayBuffer, fileInfo, isCurrent);
        } catch (error) {
            if (isCurrent()) {
                console.error('Unable to read or analyze the selected image:', error);
                window.MetaReaderApp.clearDashboardUI(`Unable to analyze image: ${error.message}`);
            }
        } finally {
            if (isCurrent()) {
                DOM.btnRunAnalysis.disabled = false;
                DOM.btnRunAnalysis.textContent = '▶ RUN METADATA READER';
            }
        }
    }

    function mimeTypeFromName(name) {
        const extension = name.split('.').pop().toLowerCase();
        const types = {
            avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif',
            heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg',
            jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tga: 'image/x-tga',
            tiff: 'image/tiff', webp: 'image/webp'
        };
        return types[extension] || '';
    }

    document.addEventListener('DOMContentLoaded', initEvents);
})();
