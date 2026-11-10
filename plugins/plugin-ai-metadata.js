// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin: AI Image Generation Metadata
 * Reads recognized generation text and structured metadata from ExifReader tags.
 */
(function() {
    const A1111_LABELS = {
        steps: 'Steps Count',
        sampler: 'Sampling Method',
        'cfg scale': 'CFG Scale',
        seed: 'Generation Seed',
        model: 'AI Base Model',
        vae: 'VAE',
        'denoising strength': 'Denoising Strength'
    };
    const NOVELAI_LABELS = {
        prompt: 'Positive Prompt',
        uc: 'Negative Prompt',
        steps: 'Steps Count',
        sampler: 'Sampling Method',
        scale: 'CFG Scale',
        seed: 'Generation Seed',
        model_name: 'AI Base Model',
        model_hash: 'Model Hash',
        strength: 'Denoising Strength',
        noise: 'Noise Level',
        noise_schedule: 'Noise Schedule',
        width: 'Image Width',
        height: 'Image Height',
        vae: 'VAE'
    };
    const STRUCTURED_LABELS = {
        prompt: 'Positive Prompt',
        negative_prompt: 'Negative Prompt',
        steps: 'Steps Count',
        sampler: 'Sampling Method',
        sampler_name: 'Sampling Method',
        cfg: 'CFG Scale',
        cfg_scale: 'CFG Scale',
        cfgscale: 'CFG Scale',
        seed: 'Generation Seed',
        model: 'AI Base Model',
        model_name: 'AI Base Model',
        vae: 'VAE',
        denoise: 'Denoising Strength',
        denoising_strength: 'Denoising Strength',
        width: 'Image Width',
        height: 'Image Height'
    };
    const COMFY_LABELS = {
        steps: STRUCTURED_LABELS.steps,
        cfg: STRUCTURED_LABELS.cfg,
        sampler_name: STRUCTURED_LABELS.sampler_name,
        seed: STRUCTURED_LABELS.seed,
        denoise: STRUCTURED_LABELS.denoise
    };

    window.MetaReaderApp.registerPlugin('AiMetadataPlugin', {
        supportedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],

        execute: function(tags) {
            if (!tags) {
                return null;
            }

            const text = {
                software: tagText(tags.Software || tags.CreatorTool),
                parameters: tagText(tags.parameters),
                userComment: tagText(tags.UserComment),
                description: tagText(tags.Description || tags.ImageDescription),
                comment: tagText(tags.Comment),
                prompt: tagText(tags.prompt),
                workflow: tagText(tags.workflow)
            };
            const rows = [];

            // Try format-specific structures first so ordinary descriptions are not mistaken for prompts.
            if (parseAutomatic1111(text.parameters || text.userComment, rows)) {
                return makeResult(rows);
            }
            if (parseNovelAi(text, rows)) {
                return makeResult(rows);
            }

            const parameterJson = parseJson(text.parameters);
            if (parseStructuredParameters(parameterJson, rows)) {
                return makeResult(rows);
            }

            if (text.prompt || text.workflow) {
                rows.push({ label: 'AI Generator Engine', value: 'ComfyUI workflow' });
                parseComfyGraph(parseJson(text.prompt), rows);
                if (text.workflow) {
                    rows.push({ label: 'ComfyUI Graph Workflow', value: text.workflow });
                }
                return makeResult(rows);
            }

            if (parseEmbeddedPrompt(tags, text, rows)) {
                return makeResult(rows);
            }
            return null;
        }
    });

    function makeResult(rows) {
        return rows.length
            ? { categoryName: '🤖 AI Generation', priority: 15, data: rows }
            : null;
    }

    function tagText(tag) {
        if (!tag) {
            return '';
        }
        const description = tag.description;
        // ExifReader uses placeholder descriptions for some UserComment encodings; decode raw bytes instead.
        if (typeof description === 'string' &&
            !/^\[(?:unicode encoded text|undefined encoding)\]$/i.test(description)) {
            return description;
        }
        return decodeExifComment(tag.value);
    }

    function decodeExifComment(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (!Array.isArray(value) || value.length < 8) {
            return '';
        }

        // Exif UserComment begins with an eight-byte encoding label, not a byte-order mark.
        const prefix = String.fromCharCode(...value.slice(0, 8));
        if (prefix.startsWith('ASCII')) {
            return decodeAsciiComment(value);
        }
        if (prefix.startsWith('UNICODE')) {
            return decodeUnicodeComment(value);
        }
        return '';
    }

    function decodeAsciiComment(value) {
        const chunks = [];
        for (let offset = 8; offset < value.length; offset += 8192) {
            chunks.push(String.fromCharCode(...value.slice(offset, offset + 8192)));
        }
        return chunks.join('').replace(/\0+$/, '').trim();
    }

    function decodeUnicodeComment(value) {
        let offset = 8;
        let littleEndian = false;
        // Exif UserComment may include a byte-order mark after its UNICODE prefix.
        if (value[offset] === 0xfe && value[offset + 1] === 0xff) {
            offset += 2;
        }
        else if (value[offset] === 0xff && value[offset + 1] === 0xfe) {
            littleEndian = true;
            offset += 2;
        }

        const text = [];
        for (let index = offset; index + 1 < value.length; index += 2) {
            const code = littleEndian
                ? (value[index + 1] << 8) | value[index]
                : (value[index] << 8) | value[index + 1];
            if (code) {
                text.push(String.fromCharCode(code));
            }
        }
        return text.join('').trim();
    }

    function parseAutomatic1111(text, rows) {
        if (typeof text !== 'string' || !text) {
            return false;
        }

        // The final Steps marker starts the settings block; earlier matches may be prompt text.
        let settingsMatch = null;
        for (const match of text.matchAll(/(?:^|[\n,]\s*)Steps\s*:\s*\d+/gi)) {
            settingsMatch = match;
        }
        if (!settingsMatch) {
            return false;
        }

        const settingsStart = settingsMatch.index + settingsMatch[0].search(/Steps/i);
        const promptBlock = text.slice(0, settingsStart).trim();
        const remaining = text.slice(settingsStart).trim();
        const metadataMarker = /,\s*(?:Hashes|AI Tags)\s*:/i.exec(remaining);
        const settingsBlock = metadataMarker
            ? remaining.slice(0, metadataMarker.index)
            : remaining;
        const additionalMetadata = metadataMarker
            ? remaining.slice(metadataMarker.index + 1).trim()
            : '';
        const settings = settingsBlock.split(/\r?\n/, 1)[0];
        const knownSettings = settings.match(
            /(?:^|,\s*)(?:sampler|cfg\s*scale|seed|size|model|vae|denoising\s*strength)\s*:/gi
        );

        const negativeStart = promptBlock.search(/(?:^|\n)\s*Negative prompt\s*:/i);
        const positive = negativeStart < 0
            ? promptBlock
            : promptBlock.slice(0, negativeStart).trim();
        const negative = negativeStart < 0
            ? ''
            : promptBlock.slice(negativeStart)
                .replace(/^(?:\n)?\s*Negative prompt\s*:/i, '').trim();
        // A prompt plus multiple recognized settings is required to avoid false positives.
        if ((!positive && !negative) || !knownSettings || knownSettings.length < 2) {
            return false;
        }

        const version = /(?:^|,\s*)Version\s*:\s*([^,\n]+)/i.exec(settings);
        rows.push({
            label: 'AI Generator Engine',
            value: version && /comfyui/i.test(version[1])
                ? 'Stable Diffusion (ComfyUI)'
                : 'Stable Diffusion (Automatic1111)'
        });
        if (positive) {
            rows.push({ label: 'Positive Prompt', value: positive });
        }
        if (negative) {
            rows.push({ label: 'Negative Prompt', value: negative });
        }

        // Split only at commas followed by a parameter-like key so prompt commas remain intact.
        const parameters = settings.split(/,\s*(?=[^,\n:]{1,80}\s*:)/);
        for (const parameter of parameters) {
            const separator = parameter.indexOf(':');
            if (separator < 0) {
                continue;
            }
            const key = parameter.slice(0, separator).trim();
            const value = parameter.slice(separator + 1).trim();
            if (key && value) {
                rows.push({ label: A1111_LABELS[key.toLowerCase()] || key, value });
            }
        }
        if (additionalMetadata) {
            rows.push({ label: 'Additional Generation Metadata', value: additionalMetadata });
        }
        return true;
    }

    function parseNovelAi(text, rows) {
        const metadata = parseJson(text.comment);
        const generationKeys = ['prompt', 'uc', 'steps', 'seed', 'sampler', 'model_name'];
        const hasGenerationFields = metadata && typeof metadata === 'object' &&
            generationKeys.some(key => Object.prototype.hasOwnProperty.call(metadata, key));
        if (!/novelai/i.test(text.software) && !hasGenerationFields) {
            return false;
        }

        rows.push({ label: 'AI Generator Engine', value: 'NovelAI Image Generation' });
        if (!metadata || typeof metadata !== 'object') {
            if (text.description) {
                rows.push({ label: 'Positive Prompt', value: text.description });
            }
            if (text.comment) {
                rows.push({ label: 'NovelAI Parameter Block (Unparsed)', value: text.comment });
            }
            return true;
        }

        // Keep unknown NovelAI fields visible so new parameters are not silently lost.
        Object.entries(metadata).forEach(([key, value]) => {
            const label = NOVELAI_LABELS[key];
            rows.push({
                label: label || `NovelAI ${key}`,
                value: displayValue(value)
            });
        });
        if (!metadata.prompt && text.description) {
            rows.push({ label: 'Positive Prompt', value: text.description });
        }
        return true;
    }

    function parseStructuredParameters(metadata, rows) {
        const parameters = metadata && metadata.sui_image_params;
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
            return false;
        }

        rows.push({ label: 'AI Generator Engine', value: 'Stable Diffusion (embedded parameters)' });
        Object.entries(parameters).forEach(([key, value]) => {
            rows.push({
                label: STRUCTURED_LABELS[key.toLowerCase()] || `Generation ${key}`,
                value: displayValue(value)
            });
        });
        // Preserve fields alongside sui_image_params as well as the recognized parameter object.
        Object.entries(metadata).forEach(([key, value]) => {
            if (key !== 'sui_image_params') {
                rows.push({ label: `Generation ${key}`, value: displayValue(value) });
            }
        });
        return true;
    }

    function parseComfyGraph(graph, rows) {
        if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
            return;
        }

        const nodes = Object.entries(graph);
        const nodesById = new Map(nodes);
        let samplerEntry = null;
        for (const entry of nodes) {
            const node = entry[1];
            if (node && /ksampler/i.test(node.class_type || '')) {
                samplerEntry = entry;
                break;
            }
        }
        const samplerInputs = samplerEntry && samplerEntry[1].inputs || {};

        const positive = connectedText(samplerInputs.positive, nodesById);
        const negative = connectedText(samplerInputs.negative, nodesById);
        if (positive) {
            rows.push({ label: 'Positive Prompt', value: positive });
        }
        if (negative) {
            rows.push({ label: 'Negative Prompt', value: negative });
        }

        for (const [key, label] of Object.entries(COMFY_LABELS)) {
            if (samplerInputs[key] !== undefined) {
                rows.push({ label, value: displayValue(samplerInputs[key]) });
            }
        }

        const modelLink = samplerInputs.model;
        const modelNode = linkedNode(modelLink, nodesById);
        if (modelNode && modelNode.inputs && modelNode.inputs.ckpt_name) {
            rows.push({ label: 'AI Base Model', value: modelNode.inputs.ckpt_name });
        }

        const standardNodes = new Set([
            'ksampler',
            'cliptextencode',
            'checkpointloadersimple',
            'vaedecode',
            'saveimage'
        ]);
        const customNodes = new Set();
        for (const [, node] of nodes) {
            const type = node && node.class_type;
            if (type && !standardNodes.has(type.toLowerCase())) {
                customNodes.add(type);
            }
        }
        if (customNodes.size) {
            rows.push({ label: 'ComfyUI Custom Nodes', value: [...customNodes].join(', ') });
        }
    }

    function connectedText(link, nodesById) {
        const visited = new Set();
        const pendingLinks = [link];

        // Workflows may nest links inside conditioning lists; visited IDs prevent graph cycles.
        while (pendingLinks.length) {
            const currentLink = pendingLinks.pop();
            if (!Array.isArray(currentLink)) {
                continue;
            }

            if (Array.isArray(currentLink[0])) {
                for (let index = currentLink.length - 1; index >= 0; index--) {
                    if (Array.isArray(currentLink[index])) {
                        pendingLinks.push(currentLink[index]);
                    }
                }
                continue;
            }

            const nodeId = currentLink[0];
            if (nodeId === undefined || nodeId === null) {
                continue;
            }
            const nodeKey = String(nodeId);
            if (visited.has(nodeKey)) {
                continue;
            }
            visited.add(nodeKey);

            const node = nodesById.get(nodeKey);
            if (!node || !node.inputs) {
                continue;
            }
            if (/cliptextencode/i.test(node.class_type || '') &&
                typeof node.inputs.text === 'string') {
                return node.inputs.text;
            }

            const inputs = Object.values(node.inputs);
            for (let index = inputs.length - 1; index >= 0; index--) {
                if (Array.isArray(inputs[index])) {
                    pendingLinks.push(inputs[index]);
                }
            }
        }
        return '';
    }

    function linkedNode(link, nodesById) {
        if (!Array.isArray(link) || link.length < 2) {
            return null;
        }
        return nodesById.get(String(link[0])) || null;
    }

    function parseEmbeddedPrompt(tags, text, rows) {
        const creator = `${text.software} ${tagText(tags.Creator)}`.toLowerCase();
        const source = tagText(tags.DigitalSourceType);
        const prompt = text.description || text.userComment;
        if (!prompt) {
            return false;
        }

        const namedGenerator = /midjourney|dall[\s-]?e|stable diffusion|novelai/i.test(creator);
        const taggedAsAi = /trainedalgorithmicmedia/i.test(source);
        // Require an engine/source hint or recognizable prompt markers to limit false positives.
        const promptLooksGenerated =
            /(?:^|,\s*)(?:1girl|1boy|masterpiece|best quality|highres|score_\d+)/i.test(prompt) &&
            (/\b[a-z][a-z0-9_]*_[a-z0-9_]+\b/i.test(prompt) ||
                /--(?:ar|v|stylize|chaos)\s/i.test(prompt));
        if (!namedGenerator && !taggedAsAi && !promptLooksGenerated) {
            return false;
        }

        let engine = 'Embedded generation prompt (engine unknown)';
        if (creator.includes('midjourney')) {
            engine = 'Midjourney';
        } else if (creator.includes('dall')) {
            engine = 'DALL-E';
        }
        rows.push({ label: 'AI Generator Engine', value: engine });
        rows.push({ label: 'Positive Prompt', value: prompt });

        const parameters = prompt.match(/--(?:ar|v|stylize|chaos)\s+[^,]+/gi);
        if (parameters) {
            rows.push({ label: 'Generation Parameters', value: parameters.join(', ') });
        }
        return true;
    }

    function parseJson(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function displayValue(value) {
        if (value === null || typeof value !== 'object') {
            return String(value);
        }
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    }
})();
