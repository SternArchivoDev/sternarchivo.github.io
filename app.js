/**
 * StitchVim – Neovim Config Generator
 * Modular JavaScript, data-driven from vectorialData.json
 * Tutti i file sono nella stessa directory, il caricamento è robusto.
 */
(function () {
    'use strict';

    // ============================================================
    // DOM References
    // ============================================================
    const DOM = {
        pkgSelect: document.getElementById('pkgManager'),
        chkNoComments: document.getElementById('chkNoComments'),
        chkArchive: document.getElementById('chkArchive'),
        generateBtn: document.getElementById('generateBtn'),
        downloadBtn: document.getElementById('downloadZipBtn'),
        fileList: document.getElementById('fileList'),
        fileContent: document.getElementById('fileContent'),
        statusMsg: document.getElementById('statusMessage'),
        versionBadge: document.getElementById('versionBadge'),
    };

    // ============================================================
    // State
    // ============================================================
    const state = {
        config: null,          // dati da vectorialData.json
        files: null,           // { path: content, ... }
        selectedPath: null,
        isLoading: false,
        configLoaded: false,
    };

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
            : '🚀 Genera';
    }

    function setButtonsEnabled(enabled) {
        DOM.generateBtn.disabled = !enabled || !state.configLoaded;
        DOM.downloadBtn.disabled = !enabled || !state.files || !state.configLoaded;
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
    // Load Configuration (con fallback)
    // ============================================================
    async function loadConfig() {
        setButtonsEnabled(false);
        showStatus('⏳ Caricamento configurazione...', 'info');

        // Tentativi di URL: prima assoluto, poi relativo
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

        // Validazione
        if (!data.snippets || !data.fileTemplates) {
            showStatus('❌ Struttura JSON non valida: mancano "snippets" o "fileTemplates".', 'danger');
            DOM.versionBadge.textContent = 'v?';
            setButtonsEnabled(false);
            return;
        }

        state.config = data;
        state.configLoaded = true;
        console.log('✅ Configurazione caricata:', data);

        // Aggiorna badge versione
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
            const pkg = DOM.pkgSelect.value;
            const noComments = DOM.chkNoComments.checked;
            const genDate = new Date().toISOString().replace('T', ' ').slice(0, 19);
            const pkgName = pkg.charAt(0).toUpperCase() + pkg.slice(1);

            const snippetKey = noComments ? 'active' : 'commented';

            // Estrai i contenuti dal JSON
            const snippet = state.config.snippets[pkg]?.[snippetKey] || state.config.snippets.other[snippetKey];
            const options = state.config.optionsContent?.[snippetKey] || '';
            const keymaps = state.config.keymapsContent?.[snippetKey] || '';
            const autocmds = state.config.autocmdsContent?.[snippetKey] || '';

            const version = state.config.version || '0.0.0';

            // --- IL MESSAGGIO DI BENVENUTO USA VIM.NOTIFY IN ENTRAMBI I CASI ---
            // Se NoComments è attivo, la riga è attiva; altrimenti è commentata.
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

            // Genera i file
            const files = {};
            for (const tmpl of state.config.fileTemplates) {
                files[tmpl.path] = renderTemplate(tmpl.template, context);
            }

            state.files = files;
            renderFileList(files);
            selectFirstFile(files);

            showStatus(`✅ Generati ${Object.keys(files).length} file`, 'success');
            DOM.downloadBtn.disabled = false;

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

        // Event listeners per i file
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

        // Aggiorna classe attiva
        DOM.fileList.querySelectorAll('.file-item').forEach((el) => {
            el.classList.toggle('active', el.dataset.path === path);
        });

        const content = state.files[path];
        const ext = path.split('.').pop();

        // Meta info
        const meta = `
            <div class="file-meta">
                <span>📁 ${path}</span>
                <span>${content.length} caratteri</span>
            </div>
        `;

        // Syntax highlighting basic per Lua
        const highlighted = highlightCode(content, ext);

        DOM.fileContent.innerHTML = meta + `<pre>${highlighted}</pre>`;

        // Fade effect
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

        // Applica i pattern in ordine
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

    // Rigenera quando cambia il package manager o checkbox
    DOM.pkgSelect.addEventListener('change', generateConfig);
    DOM.chkNoComments.addEventListener('change', generateConfig);

    // ============================================================
    // Init
    // ============================================================
    loadConfig();
})();