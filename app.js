/**
 * StitchVim – Neovim Config Generator
 * Modular JavaScript con custom select animato
 */
(function () {
    'use strict';

    // ============================================================
    // DOM References
    // ============================================================
    const DOM = {
        customSelect: document.getElementById('pkgManager'),
        selectTrigger: document.querySelector('.select-trigger'),
        selectValue: document.querySelector('.select-value'),
        selectOptions: document.querySelector('.select-options'),
        selectHidden: document.getElementById('pkgManagerHidden'),
        chkNoComments: document.getElementById('chkNoComments'),
        chkArchive: document.getElementById('chkArchive'),
        chkLazyVimExtra: document.getElementById('chkLazyVimExtra'),
        generateBtn: document.getElementById('generateBtn'),
        downloadBtn: document.getElementById('downloadZipBtn'),
        resetBtn: document.getElementById('resetBtn'),
        fileList: document.getElementById('fileList'),
        fileContent: document.getElementById('fileContent'),
        statusMsg: document.getElementById('statusMessage'),
        versionBadge: document.getElementById('versionBadge'),
        previewContainer: document.getElementById('previewContainer'),
    };

    // ============================================================
    // State
    // ============================================================
    const state = {
        config: null,
        files: null,
        selectedPath: null,
        isLoading: false,
        configLoaded: false,
        pkgValue: 'lazy',
        flashTimeout: null,
    };

    // ============================================================
    // Custom Select Logic
    // ============================================================
    function initCustomSelect() {
        const { customSelect, selectTrigger, selectOptions, selectValue, selectHidden } = DOM;

        selectTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = customSelect.classList.contains('open');
            if (isOpen) closeSelect();
            else openSelect();
        });

        selectOptions.addEventListener('click', (e) => {
            const option = e.target.closest('.select-option');
            if (!option) return;
            const value = option.dataset.value;
            const label = option.textContent.trim();
            selectValue.textContent = label;
            selectHidden.value = value;
            state.pkgValue = value;

            selectOptions.querySelectorAll('.select-option').forEach(el => el.classList.remove('selected'));
            option.classList.add('selected');

            closeSelect();

            if (state.configLoaded) {
                generateConfig();
            }
        });

        document.addEventListener('click', (e) => {
            if (!customSelect.contains(e.target)) closeSelect();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSelect();
        });

        function openSelect() {
            customSelect.classList.add('open');
            selectTrigger.classList.add('active');
        }

        function closeSelect() {
            customSelect.classList.remove('open');
            selectTrigger.classList.remove('active');
        }
    }

    // ============================================================
    // UI Helpers
    // ============================================================
    function showStatus(message, type = 'info') {
        const el = DOM.statusMsg;
        el.textContent = message;
        el.className = `status-message ${type}`;
        el.style.display = 'block';
    }

    function hideStatus() {
        DOM.statusMsg.style.display = 'none';
    }

    function setLoading(loading) {
        state.isLoading = loading;
        DOM.generateBtn.disabled = loading;
        DOM.generateBtn.innerHTML = loading
            ? '<span class="spinner"></span> Generazione...'
            : '<span>🚀 Genera</span>';
    }

    function setButtonsEnabled(enabled) {
        const hasFiles = state.files && Object.keys(state.files).length > 0;
        DOM.generateBtn.disabled = !enabled || !state.configLoaded;
        DOM.downloadBtn.disabled = !enabled || !hasFiles || !state.configLoaded;
        DOM.resetBtn.disabled = !enabled || !hasFiles || !state.configLoaded;
    }

    // ============================================================
    // Reset Logic
    // ============================================================
    function resetGenerator() {
        if (state.flashTimeout) {
            clearTimeout(state.flashTimeout);
            state.flashTimeout = null;
        }
        DOM.previewContainer.classList.remove('flash');

        state.files = null;
        state.selectedPath = null;

        DOM.fileList.innerHTML = `<div class="empty-state">Nessun file generato</div>`;
        DOM.fileContent.innerHTML = `<div class="empty-state">Seleziona un file dalla lista</div>`;

        DOM.downloadBtn.disabled = true;
        DOM.resetBtn.disabled = true;

        hideStatus();
        showStatus('🔄 Stato resettato.', 'info');
        setTimeout(hideStatus, 2000);
    }

    // ============================================================
    // Template Engine
    // ============================================================
    function renderTemplate(template, context) {
        return template.replace(/\{(\w+)\}/g, (_, key) => {
            return Object.hasOwn(context, key) ? context[key] : '';
        });
    }

    // ============================================================
    // Load Configuration
    // ============================================================
    async function loadConfig() {
        setButtonsEnabled(false);
        showStatus('⏳ Caricamento configurazione...', 'info');

        const urls = [
            `/vectorialData.json?t=${Date.now()}`,
            `vectorialData.json?t=${Date.now()}`,
        ];

        let data = null;
        let lastError = null;

        for (const url of urls) {
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (response.ok) {
                    data = await response.json();
                    console.log(`✅ Configurazione caricata da: ${url}`);
                    break;
                }
            } catch (err) {
                lastError = err;
                console.warn(`❌ Tentativo fallito: ${url}`, err);
            }
        }

        if (!data) {
            console.error('❌ Tutti i tentativi di caricamento falliti:', lastError);
            showStatus(
                '❌ Impossibile caricare vectorialData.json. Verifica che il file esista nella stessa directory di index.html.',
                'danger'
            );
            DOM.versionBadge.textContent = 'v?';
            setButtonsEnabled(false);
            return;
        }

        if (!data.snippets || !data.fileTemplates) {
            showStatus('❌ Struttura JSON non valida: mancano "snippets" o "fileTemplates".', 'danger');
            DOM.versionBadge.textContent = 'v?';
            setButtonsEnabled(false);
            return;
        }

        state.config = data;
        state.configLoaded = true;
        console.log('✅ Configurazione caricata:', data);

        if (DOM.versionBadge && data.version) {
            DOM.versionBadge.textContent = `v${data.version}`;
        }

        hideStatus();
        setButtonsEnabled(true);
        generateConfig();
    }

    // ============================================================
    // Generate Configuration
    // ============================================================
    function generateConfig() {
        if (!state.configLoaded || !state.config) {
            showStatus('Configurazione non disponibile. Ricarica la pagina.', 'warning');
            return;
        }

        if (state.isLoading) return;
        setLoading(true);
        hideStatus();

        try {
            const pkg = state.pkgValue;
            const noComments = DOM.chkNoComments.checked;
            const lazyVimExtra = DOM.chkLazyVimExtra.checked;

            const genDate = new Intl.DateTimeFormat('it-IT', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }).format(new Date()).replace(/\//g, '-');

            const pkgName = pkg.charAt(0).toUpperCase() + pkg.slice(1);

            const snippetKey = noComments ? 'active' : 'commented';

            const snippet = state.config.snippets[pkg]?.[snippetKey] || state.config.snippets.other[snippetKey];
            const options = state.config.optionsContent?.[snippetKey] || '';
            const keymaps = state.config.keymapsContent?.[snippetKey] || '';
            const autocmds = state.config.autocmdsContent?.[snippetKey] || '';

            const version = state.config.version || '0.0.0';

            const welcome = noComments
                ? `vim.notify("Neovim configuration loaded (StitchVim ${version})", vim.log.levels.INFO)`
                : `-- vim.notify("Neovim configuration loaded (StitchVim ${version})", vim.log.levels.INFO)`;

            const context = {
                snippet,
                optionsContent: options,
                keymapsContent: keymaps,
                autocmdsContent: autocmds,
                genDate,
                version,
                pkg,
                pkgName,
                welcome,
            };

            const files = {};

            // --- Template per nvim-notify (solo se LazyVim Extra è attivo e pkg === 'lazy') ---
            const notifyTemplate = `-- nvim-notify: fancy notifications for Neovim
-- https://github.com/rcarriga/nvim-notify

return {
    "rcarriga/nvim-notify",
    opts = {
        -- top_down = false,      -- notifiche dal basso verso l'alto
        -- timeout = 3000,        -- durata in ms
        -- render = "default",    -- "default", "compact", "minimal"
        -- stages = "fade",       -- "fade", "slide", "static"
    },
    config = function(_, opts)
        local notify = require("notify")
        notify.setup(opts)
        vim.notify = notify
    end,
}
`;

            for (const tmpl of state.config.fileTemplates) {
                // Salta i file plugins se non è lazy
                if (pkg !== 'lazy' && tmpl.path.startsWith('lua/plugins/')) {
                    continue;
                }

                // Se è il file example.lua e LazyVim Extra è attivo, lo sostituiamo con notify
                if (lazyVimExtra && pkg === 'lazy' && tmpl.path === 'lua/plugins/example.lua') {
                    // Lo saltiamo, perché generiamo notify.lua al suo posto
                    continue;
                }

                files[tmpl.path] = renderTemplate(tmpl.template, context);
            }

            // Se LazyVim Extra è attivo e pkg === 'lazy', aggiungiamo notify.lua
            if (lazyVimExtra && pkg === 'lazy') {
                // Se non ci sono file nella cartella plugins, assicuriamoci che esista almeno notify.lua
                // (ma se example.lua è stato saltato, va bene)
                files['lua/plugins/notify.lua'] = notifyTemplate;
            }

            state.files = files;
            renderFileList(files);
            selectFirstFile(files);

            showStatus(`✅ Generati ${Object.keys(files).length} file`, 'success');
            DOM.downloadBtn.disabled = false;
            DOM.resetBtn.disabled = false;

            // --- LAMPEGGIO DEL BORDO ---
            if (state.flashTimeout) {
                clearTimeout(state.flashTimeout);
                state.flashTimeout = null;
            }
            DOM.previewContainer.classList.remove('flash');
            void DOM.previewContainer.offsetWidth;
            DOM.previewContainer.classList.add('flash');
            state.flashTimeout = setTimeout(() => {
                DOM.previewContainer.classList.remove('flash');
                state.flashTimeout = null;
            }, 5000);

        } catch (error) {
            console.error('❌ Errore generazione:', error);
            showStatus(`❌ Errore durante la generazione: ${error.message}`, 'danger');
        }

        setLoading(false);
    }

    // ============================================================
    // Render File List
    // ============================================================
    function renderFileList(files) {
        const paths = Object.keys(files).sort();

        if (paths.length === 0) {
            DOM.fileList.innerHTML = `<div class="empty-state">Nessun file</div>`;
            return;
        }

        let html = '';
        for (const path of paths) {
            const isActive = path === state.selectedPath ? 'active' : '';
            const icon = getFileIcon(path);
            html += `
                <div class="file-item ${isActive}" data-path="${path}">
                    <span class="icon">${icon}</span>
                    ${path}
                </div>
            `;
        }

        DOM.fileList.innerHTML = html;

        DOM.fileList.querySelectorAll('.file-item').forEach((el) => {
            el.addEventListener('click', () => {
                const path = el.dataset.path;
                if (path) selectFile(path);
            });
        });
    }

    function getFileIcon(path) {
        if (path.endsWith('.lua')) return '🔧';
        if (path.endsWith('.vim')) return '⚙️';
        if (path.endsWith('.md')) return '📝';
        return '📄';
    }

    function selectFirstFile(files) {
        const paths = Object.keys(files).sort();
        if (paths.length > 0) {
            selectFile(paths[0]);
        }
    }

    // ============================================================
    // Select & Show File
    // ============================================================
    function selectFile(path) {
        if (!state.files || !state.files[path]) return;

        state.selectedPath = path;

        DOM.fileList.querySelectorAll('.file-item').forEach((el) => {
            el.classList.toggle('active', el.dataset.path === path);
        });

        const content = state.files[path];
        const ext = path.split('.').pop();

        const meta = `
            <div class="file-meta">
                <span>📁 ${path}</span>
                <span>${content.length} caratteri</span>
            </div>
        `;

        const highlighted = highlightCode(content, ext);
        DOM.fileContent.innerHTML = meta + `<pre>${highlighted}</pre>`;

        DOM.fileContent.style.opacity = '0';
        requestAnimationFrame(() => {
            DOM.fileContent.style.transition = 'opacity 0.15s ease';
            DOM.fileContent.style.opacity = '1';
        });
    }

    // ============================================================
    // Basic Syntax Highlighting (Lua)
    // ============================================================
    function highlightCode(content, ext) {
        if (ext !== 'lua') return escapeHtml(content);

        const patterns = [
            { regex: /(--\[\[[\s\S]*?\]\]|--.*)/g, css: 'comment' },
            { regex: /(['"])(?:(?!\1).)*?\1/g, css: 'string' },
            { regex: /\b(if|then|else|elseif|end|function|local|return|for|while|do|break|nil|true|false|and|or|not)\b/g, css: 'keyword' },
            { regex: /\b([A-Za-z_]\w*)\s*(?=\()/g, css: 'function' },
            { regex: /\b(\d+\.?\d*)\b/g, css: 'number' },
        ];

        let html = escapeHtml(content);
        for (const pattern of patterns) {
            html = html.replace(pattern.regex, (match) => {
                return `<span class="${pattern.css}">${match}</span>`;
            });
        }
        return html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================
    // Download ZIP
    // ============================================================
    async function downloadZip() {
        if (!state.files || Object.keys(state.files).length === 0) {
            showStatus('Nessun file da impacchettare.', 'warning');
            return;
        }

        hideStatus();
        DOM.downloadBtn.disabled = true;
        DOM.downloadBtn.innerHTML = '<span class="spinner"></span> Creazione ZIP...';

        try {
            const zip = new JSZip();

            for (const [path, content] of Object.entries(state.files)) {
                zip.file(path, content);
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const filename = `nvim_config_${timestamp}.zip`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showStatus('✅ ZIP scaricato con successo.', 'success');

        } catch (error) {
            console.error('❌ Errore ZIP:', error);
            showStatus(`❌ Errore creazione ZIP: ${error.message}`, 'danger');
        }

        DOM.downloadBtn.disabled = false;
        DOM.downloadBtn.innerHTML = '📦 Scarica ZIP';
    }

    // ============================================================
    // Event Listeners
    // ============================================================
    DOM.generateBtn.addEventListener('click', generateConfig);
    DOM.downloadBtn.addEventListener('click', downloadZip);
    DOM.resetBtn.addEventListener('click', resetGenerator);
    DOM.chkNoComments.addEventListener('change', generateConfig);
    DOM.chkLazyVimExtra.addEventListener('change', generateConfig);

    // ============================================================
    // Init
    // ============================================================
    initCustomSelect();
    loadConfig();
})();