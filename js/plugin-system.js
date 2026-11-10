// SPDX-License-Identifier: Apache-2.0
/**
 * Core Plugin Orchestrator System
 * Parses metadata once, executes registered plugins, and renders their results.
 */
(function() {
    // Buffer keys let cached parses be collected when their image session is discarded.
    const metadataCache = new WeakMap();
    let pipelineRunId = 0;

    const UI = {
        tabList: document.getElementById('left-tab-list'),
        dataViewport: document.getElementById('tab-data-viewport')
    };

    const app = window.MetaReaderApp = {
        plugins: Object.create(null),
        activeDatasets: [],

        // Plugins need a unique name, a callable execute method, and at least one MIME type.
        registerPlugin: function(name, plugin) {
            if (typeof name !== 'string' || !name.trim()) {
                throw new TypeError('Plugin registration requires a non-empty name.');
            }
            if (Object.prototype.hasOwnProperty.call(this.plugins, name)) {
                throw new Error(`A plugin named "${name}" is already registered.`);
            }
            if (!plugin || typeof plugin.execute !== 'function') {
                throw new TypeError(`Plugin "${name}" must provide an execute function.`);
            }
            if (!Array.isArray(plugin.supportedMimeTypes) || plugin.supportedMimeTypes.length === 0 ||
                !plugin.supportedMimeTypes.every(type => typeof type === 'string' && type.trim())) {
                throw new TypeError(`Plugin "${name}" must declare valid supported MIME types.`);
            }
            // Plugin scripts register after this core script, before users can run analysis.
            this.plugins[name] = plugin;
        },

        clearDashboardUI: function(message) {
            pipelineRunId++;
            this.activeDatasets = [];
            UI.tabList.replaceChildren();
            const placeholder = document.createElement('div');
            placeholder.className = 'tab-placeholder';
            placeholder.textContent = message || 'Load images to populate tags';
            UI.tabList.appendChild(placeholder);
            renderPlaceholder('No analysis executed yet');
        },

        runPipeline: async function(arrayBuffer, fileInfo, isCurrent) {
            const currentRunId = ++pipelineRunId;
            const stillCurrent = typeof isCurrent === 'function' ? isCurrent : () => true;
            this.activeDatasets = [];

            let parsedTags;
            let parseError = null;
            try {
                if (!window.ExifReader || typeof window.ExifReader.load !== 'function') {
                    throw new Error('The local ExifReader library is unavailable.');
                }
                parsedTags = metadataCache.get(arrayBuffer);
                if (!parsedTags) {
                    parsedTags = window.ExifReader.load(arrayBuffer);
                    metadataCache.set(arrayBuffer, parsedTags);
                }
            } catch (error) {
                parseError = error;
                console.error('Metadata parsing failed:', error);
            }

            const results = [];
            for (const [name, plugin] of Object.entries(this.plugins)) {
                if (!supportsMimeType(plugin, fileInfo && fileInfo.type)) {
                    continue;
                }
                if (!stillCurrent() || currentRunId !== pipelineRunId) {
                    return;
                }

                try {
                    const result = await plugin.execute(parsedTags, fileInfo, parseError);
                    if (!result) {
                        continue;
                    }
                    if (typeof result.categoryName !== 'string' || !result.categoryName.trim() ||
                        !Array.isArray(result.data) ||
                        (result.priority !== undefined && !Number.isFinite(result.priority)) ||
                        !result.data.every(row => row && typeof row.label === 'string' &&
                            (row.value === undefined || row.value === null ||
                                ['string', 'number', 'boolean', 'object'].includes(typeof row.value)) &&
                            (row.href === undefined || typeof row.href === 'string'))) {
                        throw new TypeError('Plugin returned an invalid result format.');
                    }
                    if (result.data.length) {
                        results.push({ ...result, pluginName: name });
                    }
                } catch (error) {
                    // Keep one plugin's failure from suppressing other plugins' results.
                    console.error(`Execution failure within plugin "${name}":`, error);
                }
            }

            if (!stillCurrent() || currentRunId !== pipelineRunId) {
                return;
            }

            results.sort((a, b) => {
                const leftPriority = a.priority === undefined ? 100 : a.priority;
                const rightPriority = b.priority === undefined ? 100 : b.priority;
                return leftPriority - rightPriority;
            });
            const categories = new Map();
            results.forEach(result => {
                const existing = categories.get(result.categoryName);
                if (existing) {
                    existing.data.push(...result.data);
                } else {
                    categories.set(result.categoryName, { ...result, data: result.data.slice() });
                }
            });
            this.activeDatasets = Array.from(categories.values());
            renderDynamicTabContainer(parseError);
        }
    };

    function supportsMimeType(plugin, mimeType) {
        return plugin.supportedMimeTypes.includes('*/*') ||
            (Boolean(mimeType) && plugin.supportedMimeTypes.includes(mimeType));
    }

    function renderPlaceholder(message) {
        UI.dataViewport.replaceChildren();
        const { table, body } = createMetadataTable();
        const row = body.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 2;
        const text = document.createElement('span');
        text.className = 'placeholder-text';
        text.textContent = message;
        cell.appendChild(text);
        UI.dataViewport.appendChild(table);
    }

    function renderDynamicTabContainer(parseError) {
        UI.tabList.replaceChildren();
        if (app.activeDatasets.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'tab-placeholder';
            placeholder.textContent = parseError
                ? 'Metadata parsing failed; only file properties are available.'
                : 'No metadata tags extracted.';
            UI.tabList.appendChild(placeholder);
            renderPlaceholder(parseError ? `Metadata parsing failed: ${parseError.message}` :
                'No plugins generated tags for this format.');
            return;
        }

        app.activeDatasets.forEach((dataset, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `tab-btn${index === 0 ? ' is-active' : ''}`;
            button.append(document.createTextNode(dataset.categoryName));

            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = String(dataset.data.length);
            button.appendChild(badge);
            button.addEventListener('click', () => {
                UI.tabList.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('is-active'));
                button.classList.add('is-active');
                renderActiveTableRows(dataset);
            });
            UI.tabList.appendChild(button);
        });

        renderActiveTableRows(app.activeDatasets[0]);
    }

    function renderActiveTableRows(dataset) {
        UI.dataViewport.replaceChildren();
        const { table, body } = createMetadataTable();
        dataset.data.forEach(rowData => {
            const row = body.insertRow();
            const labelCell = row.insertCell();
            // Metadata is untrusted; display it as text rather than interpreting markup.
            labelCell.textContent = rowData.label;
            const valueCell = row.insertCell();

            if (rowData.control === 'search') {
                const input = document.createElement('input');
                input.type = 'search';
                input.className = 'raw-data-search';
                input.placeholder = rowData.placeholder || 'Filter metadata';
                input.setAttribute('aria-label', input.placeholder);
                input.addEventListener('input', () => {
                    const query = input.value.trim().toLocaleLowerCase();
                    Array.from(body.rows).forEach(candidate => {
                        if (candidate === row) {
                            return;
                        }
                        candidate.hidden = !candidate.textContent.toLocaleLowerCase().includes(query);
                    });
                });
                valueCell.appendChild(input);
                return;
            }

            if (rowData.href) {
                const link = safeExternalLink(rowData.href);
                if (link) {
                    link.textContent = String(rowData.value ?? rowData.href);
                    valueCell.appendChild(link);
                    return;
                }
            }
            valueCell.textContent = formatValue(rowData.value);
        });
        UI.dataViewport.appendChild(table);
    }

    function createMetadataTable() {
        const table = document.createElement('table');
        table.className = 'metadata-table';
        const header = table.createTHead().insertRow();
        ['Property Name', 'Value Description'].forEach(label => {
            const cell = document.createElement('th');
            cell.textContent = label;
            header.appendChild(cell);
        });
        return { table, body: table.createTBody() };
    }

    function safeExternalLink(value) {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') {
                return null;
            }
            const link = document.createElement('a');
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            return link;
        } catch (error) {
            return null;
        }
    }

    function formatValue(value) {
        if (value === undefined || value === null) {
            return 'N/A';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        try {
            return JSON.stringify(value);
        } catch (error) {
            return Object.prototype.toString.call(value);
        }
    }

    app.clearDashboardUI();
})();
