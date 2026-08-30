/**
 * StitchVim – Config Generator (solo Vimscript9)
 * Rileva la pagina tramite data-page (solo 'vim' o 'home')
 */
(function () {
    'use strict';

    // ============================================================
    // Rilevamento pagina
    // ============================================================
    const page = document.body.dataset.page || 'home'; // 'vim', 'home'

    // ============================================================
    // DOM references
    // ============================================================
    const DOM = {
        pkgManager: document.getElementById('pkgManager'),
        pkgTrigger: document.querySelector('#pkgManager .select-trigger'),
        pkgValueDisplay: document.getElementById('pkgValueDisplay'),
        pkgOptions: document.getElementById('pkgOptionsContainer'),
        pkgHidden: document.getElementById('pkgManagerHidden'),

        chkNoComments: document.getElementById('chkNoComments'),
        chkArchive: document.getElementById('chkArchive'),
        generateBtn: document.getElementById('generateBtn'),
        downloadBtn: document.getElementById('downloadZipBtn'),
        resetBtn: document.getElementById('resetBtn'),
        fileList: document.getElementById('fileList'),
        fileContent: document.getElementById('fileContent'),
        statusMsg: document.getElementById('statusMessage'),
        versionBadge: document.getElementById('versionBadge'),
        previewContainer: document.getElementById('previewContainer'),
    };

    // Se non siamo in una pagina di generazione (home), carica solo la versione
    if (page === 'home') {
        fetchVersion();
        return;
    }

    // ============================================================
    // Stato (solo Vimscript9)
    // ============================================================
    const state = {
        config: null,
        files: null,
        selectedPath: null,
        isLoading: false,
        configLoaded: false,
        pkgValue: 'minimal',
        langValue: 'vim9',
        flashTimeout: null,
    };

    // ============================================================
    // i18n semplificato
    // ============================================================
    const lang = navigator.language.startsWith('it') ? 'it' : 'en';
    const i18n = {
        it: {
            no_files: 'Nessun file generato',
            select_file: 'Seleziona un file dalla lista',
            generate_btn: '🚀 Genera',
            reset_btn: '🔄 Reset',
            download_zip_btn: '📦 Scarica ZIP',
        },
        en: {
            no_files: 'No files generated',
            select_file: 'Select a file from the list',
            generate_btn: '🚀 Generate',
            reset_btn: '🔄 Reset',
            download_zip_btn: '📦 Download ZIP',
        }
    };
    const t = i18n[lang] || i18n.en;

    // ============================================================
    // Version
    // ============================================================
    async function fetchVersion() {
        try {
            const res = await fetch('vectorialData.json?t=' + Date.now());
            if (res.ok) {
                const data = await res.json();
                if (DOM.versionBadge) DOM.versionBadge.textContent = `v${data.version}`;
            }
        } catch (_) {}
    }

    // ============================================================
    // UI Helpers
    // ============================================================
    function showStatus(msg, type = 'info') {
        const el = DOM.statusMsg;
        if (!el) return;
        el.textContent = msg;
        el.className = `status-message ${type}`;
        el.style.display = 'block';
    }
    function hideStatus() {
        if (DOM.statusMsg) DOM.statusMsg.style.display = 'none';
    }

    function setLoading(loading) {
        state.isLoading = loading;
        DOM.generateBtn.disabled = loading;
        DOM.generateBtn.innerHTML = loading
            ? `<span class="spinner"></span> ${lang === 'it' ? 'Generazione...' : 'Generating...'}`
            : (lang === 'it' ? '🚀 Genera' : '🚀 Generate');
    }

    function setButtonsEnabled(enabled) {
        const hasFiles = state.files && Object.keys(state.files).length > 0;
        const zipEnabled = DOM.chkArchive.checked && hasFiles && state.configLoaded;
        DOM.generateBtn.disabled = !enabled || !state.configLoaded;
        DOM.downloadBtn.disabled = !enabled || !zipEnabled;
        DOM.resetBtn.disabled = !enabled || !hasFiles || !state.configLoaded;
    }

    // ============================================================
    // Custom Select (generico)
    // ============================================================
    function initCustomSelect(container, hiddenInput, onSelect) {
        const trigger = container.querySelector('.select-trigger');
        const options = container.querySelector('.select-options');
        const valueSpan = container.querySelector('.select-value');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.toggle('open');
            trigger.classList.toggle('active');
        });

        options.addEventListener('click', (e) => {
            const option = e.target.closest('.select-option');
            if (!option) return;
            const value = option.dataset.value;
            const label = option.textContent.trim();
            valueSpan.textContent = label;
            hiddenInput.value = value;
            options.querySelectorAll('.select-option').forEach(el => el.classList.remove('selected'));
            option.classList.add('selected');
            container.classList.remove('open');
            trigger.classList.remove('active');
            if (typeof onSelect === 'function') onSelect(value);
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.classList.remove('open');
                trigger.classList.remove('active');
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                container.classList.remove('open');
                trigger.classList.remove('active');
            }
        });
    }

    // ============================================================
    // Package Manager options (solo Vimscript)
    // ============================================================
    function getPkgOptions() {
        return [
            { value: 'minimal', label: 'Minimal (nativo)' },
            { value: 'vimplug', label: 'Vim Plug' },
            { value: 'other', label: 'Other' }
        ];
    }

    function updatePkgOptions() {
        const container = DOM.pkgOptions;
        const hidden = DOM.pkgHidden;
        const valueSpan = DOM.pkgValueDisplay;
        container.innerHTML = '';
        const options = getPkgOptions();
        let first = null;
        options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'select-option';
            div.dataset.value = opt.value;
            div.textContent = opt.label;
            container.appendChild(div);
            if (!first) first = opt.value;
        });
        const valid = options.map(o => o.value);
        if (!valid.includes(state.pkgValue)) state.pkgValue = first;
        const selected = container.querySelector(`.select-option[data-value="${state.pkgValue}"]`);
        if (selected) {
            valueSpan.textContent = selected.textContent;
            hidden.value = state.pkgValue;
            container.querySelectorAll('.select-option').forEach(el => el.classList.remove('selected'));
            selected.classList.add('selected');
        }
        container.querySelectorAll('.select-option').forEach(el => {
            el.addEventListener('click', (e) => {
                const option = e.target.closest('.select-option');
                if (!option) return;
                const value = option.dataset.value;
                const label = option.textContent.trim();
                valueSpan.textContent = label;
                hidden.value = value;
                container.querySelectorAll('.select-option').forEach(el => el.classList.remove('selected'));
                option.classList.add('selected');
                DOM.pkgManager.classList.remove('open');
                DOM.pkgTrigger.classList.remove('active');
                state.pkgValue = value;
                if (state.configLoaded) generateConfig();
            });
        });
    }

    // ============================================================
    // Template engine
    // ============================================================
    function renderTemplate(template, context) {
        return template.replace(/\{(\w+)\}/g, (_, key) => Object.hasOwn(context, key) ? context[key] : '');
    }

    // ============================================================
    // Load config
    // ============================================================
    async function loadConfig() {
        setButtonsEnabled(false);
        showStatus(lang === 'it' ? '⏳ Caricamento configurazione...' : '⏳ Loading configuration...', 'info');
        const urls = [`/vectorialData.json?t=${Date.now()}`, `vectorialData.json?t=${Date.now()}`];
        let data = null;
        for (const url of urls) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (res.ok) { data = await res.json(); break; }
            } catch (_) {}
        }
        if (!data) {
            showStatus('❌ Impossibile caricare vectorialData.json', 'danger');
            DOM.versionBadge.textContent = 'v?';
            setButtonsEnabled(false);
            return;
        }
        if (!data.snippets || !data.fileTemplates) {
            showStatus('❌ JSON non valido', 'danger');
            DOM.versionBadge.textContent = 'v?';
            setButtonsEnabled(false);
            return;
        }
        state.config = data;
        state.configLoaded = true;
        DOM.versionBadge.textContent = `v${data.version}`;
        hideStatus();
        setButtonsEnabled(true);
        generateConfig();
    }

    // ============================================================
    // Contenuto dei comandi Stitch* per Vimscript
    // ============================================================
    function getStitchCommandsActive() {
        return `" ============================================
" Stitch Native Package Manager (Vimscript) – ACTIVE
" ============================================
"
" Comandi disponibili:
"   :StitchInstall <repo>  - clona un repository Git e lo carica
"   :StitchUpdate [name]   - aggiorna uno o tutti i pacchetti (git pull senza argomenti)
"   :StitchList            - elenca i pacchetti installati
"   :StitchClean           - rimuove pacchetti orfani (vuoti)
"   :StitchInstallAll      - installa tutti i pacchetti elencati in g:stitch_packages
"
" Per gestire le dipendenze, definisci una lista di repository in g:stitch_packages
" nel tuo init.vim o in un file dedicato.
" Esempio:
"   let g:stitch_packages = [
"     \ 'https://github.com/folke/trouble.nvim',
"     \ 'https://github.com/nvim-treesitter/nvim-treesitter',
"   \ ]
" Poi esegui :StitchInstallAll per installarli tutti.
"
" ============================================

function! StitchGetPackDir() abort
    let packdir = $HOME . '/.vim/pack/stitch/start'
    if !isdirectory(packdir)
        call mkdir(packdir, 'p')
    endif
    return packdir
endfunction

command! -nargs=1 StitchInstall call s:StitchInstall(<f-args>)
function! s:StitchInstall(repo) abort
    let l:packdir = StitchGetPackDir()
    let l:name = fnamemodify(a:repo, ':t')
    let l:target = l:packdir . '/' . l:name
    
    if isdirectory(l:target)
        echom '[Stitch] Pacchetto già installato: ' . l:name
        return
    endif
    
    echom '[Stitch] Clonazione di ' . a:repo . ' ...'
    let l:cmd = 'git clone --depth=1 ' . a:repo . ' ' . l:target
    call system(l:cmd)
    
    if v:shell_error == 0
        exec 'packadd ' . l:name
        echom '[Stitch] Pacchetto installato e caricato: ' . l:name
    else
        echohl ErrorMsg
        echom '[Stitch] Errore durante il clone di ' . a:repo
        echohl None
    endif
endfunction

command! -nargs=? StitchUpdate call s:StitchUpdate(<f-args>)
function! s:StitchUpdate(...) abort
    let l:packdir = StitchGetPackDir()
    if a:0 == 0
        for l:dir in split(glob(l:packdir . '/*'), '\n')
            if isdirectory(l:dir)
                let l:name = fnamemodify(l:dir, ':t')
                echo '[Stitch] Aggiornamento ' . l:name . ' ...'
                call system('cd ' . l:dir . ' && git pull')
                if v:shell_error == 0
                    echo '[Stitch] Aggiornato: ' . l:name
                else
                    echohl WarningMsg
                    echo '[Stitch] Errore aggiornamento ' . l:name
                    echohl None
                endif
            endif
        endfor
    else
        let l:name = a:1
        let l:target = l:packdir . '/' . l:name
        if isdirectory(l:target)
            echo '[Stitch] Aggiornamento ' . l:name . ' ...'
            call system('cd ' . l:target . ' && git pull')
            if v:shell_error == 0
                echo '[Stitch] Aggiornato: ' . l:name
            else
                echohl ErrorMsg
                echo '[Stitch] Errore aggiornamento ' . l:name
                echohl None
            endif
        else
            echohl ErrorMsg
            echo '[Stitch] Pacchetto non trovato: ' . l:name
            echohl None
        endif
    endif
endfunction

command! StitchList call s:StitchList()
function! s:StitchList() abort
    let l:packdir = StitchGetPackDir()
    let l:packages = split(glob(l:packdir . '/*'), '\n')
    if empty(l:packages)
        echo '[Stitch] Nessun pacchetto installato.'
    else
        echo '[Stitch] Pacchetti installati:'
        for l:pkg in l:packages
            echo '  - ' . fnamemodify(l:pkg, ':t')
        endfor
    endif
endfunction

command! StitchClean call s:StitchClean()
function! s:StitchClean() abort
    let l:packdir = StitchGetPackDir()
    let l:packages = split(glob(l:packdir . '/*'), '\n')
    let l:removed = 0
    for l:pkg in l:packages
        if isdirectory(l:pkg) && glob(l:pkg . '/*') == ''
            call delete(l:pkg, 'rf')
            let l:removed += 1
            echo '[Stitch] Rimosso pacchetto vuoto: ' . fnamemodify(l:pkg, ':t')
        endif
    endfor
    if l:removed == 0
        echo '[Stitch] Nessun pacchetto orfano da rimuovere.'
    else
        echo '[Stitch] Rimossi ' . l:removed . ' pacchetti orfani.'
    endif
endfunction

command! StitchInstallAll call s:StitchInstallAll()
function! s:StitchInstallAll() abort
    if !exists('g:stitch_packages')
        echom '[Stitch] g:stitch_packages non definito. Imposta la lista dei repository.'
        return
    endif
    if type(g:stitch_packages) != v:t_list
        echom '[Stitch] g:stitch_packages deve essere una lista.'
        return
    endif
    for repo in g:stitch_packages
        call s:StitchInstall(repo)
    endfor
endfunction

" ============================================
" Fine del sistema nativo Stitch
" ============================================`;
    }

    function getStitchCommandsCommented() {
        return `" ============================================
" Stitch Native Package Manager (Vimscript) – COMMENTED
" ============================================
"
" Questo file contiene i comandi nativi Stitch per la gestione dei pacchetti.
" Per attivarli, rimuovi i commenti dalle righe sottostanti.
"
" ============================================

" function! StitchGetPackDir() abort
"     let packdir = $HOME . '/.vim/pack/stitch/start'
"     if !isdirectory(packdir)
"         call mkdir(packdir, 'p')
"     endif
"     return packdir
" endfunction
"
" command! -nargs=1 StitchInstall call s:StitchInstall(<f-args>)
" function! s:StitchInstall(repo) abort
"     let l:packdir = StitchGetPackDir()
"     let l:name = fnamemodify(a:repo, ':t')
"     let l:target = l:packdir . '/' . l:name
"     
"     if isdirectory(l:target)
"         echom '[Stitch] Pacchetto già installato: ' . l:name
"         return
"     endif
"     
"     echom '[Stitch] Clonazione di ' . a:repo . ' ...'
"     let l:cmd = 'git clone --depth=1 ' . a:repo . ' ' . l:target
"     call system(l:cmd)
"     
"     if v:shell_error == 0
"         exec 'packadd ' . l:name
"         echom '[Stitch] Pacchetto installato e caricato: ' . l:name
"     else
"         echohl ErrorMsg
"         echom '[Stitch] Errore durante il clone di ' . a:repo
"         echohl None
"     endif
" endfunction
"
" command! -nargs=? StitchUpdate call s:StitchUpdate(<f-args>)
" function! s:StitchUpdate(...) abort
"     let l:packdir = StitchGetPackDir()
"     if a:0 == 0
"         for l:dir in split(glob(l:packdir . '/*'), '\n')
"             if isdirectory(l:dir)
"                 let l:name = fnamemodify(l:dir, ':t')
"                 echo '[Stitch] Aggiornamento ' . l:name . ' ...'
"                 call system('cd ' . l:dir . ' && git pull')
"                 if v:shell_error == 0
"                     echo '[Stitch] Aggiornato: ' . l:name
"                 else
"                     echohl WarningMsg
"                     echo '[Stitch] Errore aggiornamento ' . l:name
"                     echohl None
"                 endif
"             endif
"         endfor
"     else
"         let l:name = a:1
"         let l:target = l:packdir . '/' . l:name
"         if isdirectory(l:target)
"             echo '[Stitch] Aggiornamento ' . l:name . ' ...'
"             call system('cd ' . l:target . ' && git pull')
"             if v:shell_error == 0
"                 echo '[Stitch] Aggiornato: ' . l:name
"             else
"                 echohl ErrorMsg
"                 echo '[Stitch] Errore aggiornamento ' . l:name
"                 echohl None
"             endif
"         else
"             echohl ErrorMsg
"             echo '[Stitch] Pacchetto non trovato: ' . l:name
"             echohl None
"         endif
"     endif
" endfunction
"
" command! StitchList call s:StitchList()
" function! s:StitchList() abort
"     let l:packdir = StitchGetPackDir()
"     let l:packages = split(glob(l:packdir . '/*'), '\n')
"     if empty(l:packages)
"         echo '[Stitch] Nessun pacchetto installato.'
"     else
"         echo '[Stitch] Pacchetti installati:'
"         for l:pkg in l:packages
"             echo '  - ' . fnamemodify(l:pkg, ':t')
"         endfor
"     endif
" endfunction
"
" command! StitchClean call s:StitchClean()
" function! s:StitchClean() abort
"     let l:packdir = StitchGetPackDir()
"     let l:packages = split(glob(l:packdir . '/*'), '\n')
"     let l:removed = 0
"     for l:pkg in l:packages
"         if isdirectory(l:pkg) && glob(l:pkg . '/*') == ''
"             call delete(l:pkg, 'rf')
"             let l:removed += 1
"             echo '[Stitch] Rimosso pacchetto vuoto: ' . fnamemodify(l:pkg, ':t')
"         endif
"     endfor
"     if l:removed == 0
"         echo '[Stitch] Nessun pacchetto orfano da rimuovere.'
"     else
"         echo '[Stitch] Rimossi ' . l:removed . ' pacchetti orfani.'
"     endif
" endfunction
"
" command! StitchInstallAll call s:StitchInstallAll()
" function! s:StitchInstallAll() abort
"     if !exists('g:stitch_packages')
"         echom '[Stitch] g:stitch_packages non definito. Imposta la lista dei repository.'
"         return
"     endif
"     if type(g:stitch_packages) != v:t_list
"         echom '[Stitch] g:stitch_packages deve essere una lista.'
"         return
"     endif
"     for repo in g:stitch_packages
"         call s:StitchInstall(repo)
"     endfor
" endfunction

" ============================================
" Fine del sistema nativo Stitch
" ============================================`;
    }

    // ============================================================
    // Generazione file per Vimscript Minimal (nativo)
    // ============================================================
    function generateVimMinimalFiles(context, templates) {
        const noComments = DOM.chkNoComments.checked;
        const files = {};

        const initTemplate = templates.find(t => t.path === 'init.vim');
        if (initTemplate) {
            const minimalSnippet = `" Load user configuration\nsource vim/user/init.vim`;
            const initContext = { ...context, snippet: minimalSnippet };
            files['init.vim'] = renderTemplate(initTemplate.template, initContext);
        }

        for (const tmpl of templates) {
            if (tmpl.path === 'init.vim') continue;
            if (tmpl.path === 'plugin/example.vim') continue;
            files[tmpl.path] = renderTemplate(tmpl.template, context);
        }

        files['plugin/stitch.vim'] = noComments ? getStitchCommandsActive() : getStitchCommandsCommented();

        return files;
    }

    // ============================================================
    // Generate
    // ============================================================
    function generateConfig() {
        if (!state.configLoaded || !state.config) {
            showStatus('Configurazione non disponibile.', 'warning');
            return;
        }
        if (state.isLoading) return;
        setLoading(true);
        hideStatus();
        try {
            const lang = state.langValue;
            const pkg = state.pkgValue;
            const noComments = DOM.chkNoComments.checked;

            const genDate = new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-US', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }).format(new Date()).replace(/\//g, '-');

            const langSnippets = state.config.snippets[lang] || state.config.snippets.vim9;
            const snippetKey = noComments ? 'active' : 'commented';
            let snippet = langSnippets[pkg]?.[snippetKey];
            if (!snippet) snippet = langSnippets.minimal?.[snippetKey] || langSnippets.other?.[snippetKey] || '';

            const options = state.config.optionsContent?.[lang]?.[snippetKey] || '';
            const keymaps = state.config.keymapsContent?.[lang]?.[snippetKey] || '';
            const autocmds = state.config.autocmdsContent?.[lang]?.[snippetKey] || '';
            const version = state.config.version || '0.0.0';

            const welcome = noComments
                ? `echom "Neovim configuration loaded (StitchVim ${version})"`
                : `\" echom "Neovim configuration loaded (StitchVim ${version})"`;

            const context = {
                snippet,
                optionsContent: options,
                keymapsContent: keymaps,
                autocmdsContent: autocmds,
                genDate,
                version,
                pkg,
                welcome
            };

            let files = {};
            const templates = state.config.fileTemplates[lang] || state.config.fileTemplates.vim9;

            if (pkg === 'minimal') {
                files = generateVimMinimalFiles(context, templates);
            } else {
                for (const tmpl of templates) {
                    files[tmpl.path] = renderTemplate(tmpl.template, context);
                }
            }

            state.files = files;
            renderFileList(files);
            selectFirstFile(files);
            showStatus(`✅ Generati ${Object.keys(files).length} file`, 'success');
            setButtonsEnabled(true);
            if (state.flashTimeout) clearTimeout(state.flashTimeout);
            DOM.previewContainer.classList.remove('flash');
            void DOM.previewContainer.offsetWidth;
            DOM.previewContainer.classList.add('flash');
            state.flashTimeout = setTimeout(() => {
                DOM.previewContainer.classList.remove('flash');
                state.flashTimeout = null;
            }, 5000);
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'danger');
            console.error(err);
        }
        setLoading(false);
    }

    // ============================================================
    // File list and preview (invariati)
    // ============================================================
    function renderFileList(files) {
        const container = DOM.fileList;
        container.innerHTML = '';
        const paths = Object.keys(files).sort();
        if (paths.length === 0) {
            container.innerHTML = `<div class="empty-state">${t.no_files}</div>`;
            return;
        }
        paths.forEach(path => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.dataset.path = path;
            const icon = getFileIcon(path);
            div.innerHTML = `<span class="icon">${icon}</span><span>${path}</span>`;
            div.addEventListener('click', () => selectFile(path));
            container.appendChild(div);
        });
    }

    function getFileIcon(path) {
        if (path.endsWith('.lua')) return '📘';
        if (path.endsWith('.vim') || path.endsWith('.vim9')) return '📗';
        if (path.endsWith('.md')) return '📄';
        if (path.endsWith('.json')) return '📦';
        return '📄';
    }

    function selectFirstFile(files) {
        const paths = Object.keys(files).sort();
        if (paths.length > 0) selectFile(paths[0]);
        else {
            DOM.fileContent.innerHTML = `<div class="empty-state">${t.select_file}</div>`;
        }
    }

    function selectFile(path) {
        state.selectedPath = path;
        document.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.path === path);
        });
        const content = state.files[path] || '';
        const ext = path.split('.').pop().toLowerCase();
        let htmlContent = '';
        if (ext === 'lua' || ext === 'vim' || ext === 'vim9') {
            htmlContent = highlightCode(content, ext);
        } else {
            htmlContent = `<pre>${escapeHtml(content)}</pre>`;
        }
        const meta = `<div class="file-meta"><span>${path}</span><span>${content.split('\n').length} righe</span></div>`;
        DOM.fileContent.innerHTML = meta + htmlContent;
    }

    // ============================================================
    // Syntax Highlighting
    // ============================================================
    function highlightCode(content, ext) {
        if (ext === 'lua') return highlightLua(content);
        if (ext === 'vim' || ext === 'vim9') return highlightVim(content);
        return `<pre>${escapeHtml(content)}</pre>`;
    }

    function highlightLua(content) { /* non usato ma mantenuto per consistenza */ return `<pre>${escapeHtml(content)}</pre>`; }

    function highlightVim(content) {
        const lines = content.split('\n');
        const out = lines.map(line => {
            let html = escapeHtml(line);
            html = html.replace(/("[^"]*)$/, '<span class="comment">$1</span>');
            html = html.replace(/("[^"]*")/g, '<span class="string">$1</span>');
            const keywords = ['function', 'endfunction', 'command', 'if', 'else', 'endif', 'let', 'set', 'echom', 'call', 'source'];
            const kwRegex = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'g');
            html = html.replace(kwRegex, '<span class="keyword">$1</span>');
            return html;
        }).join('\n');
        return `<pre>${out}</pre>`;
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
        if (!DOM.chkArchive.checked) {
            showStatus('⚠️ Abilita "Generate ZIP"', 'warning');
            return;
        }
        if (!state.files || Object.keys(state.files).length === 0) {
            showStatus('Nessun file.', 'warning');
            return;
        }
        hideStatus();
        DOM.downloadBtn.disabled = true;
        DOM.downloadBtn.innerHTML = `<span class="spinner"></span> ${lang === 'it' ? 'Creazione ZIP...' : 'Creating ZIP...'}`;
        try {
            const zip = new JSZip();
            for (const [path, content] of Object.entries(state.files)) {
                zip.file(path, content);
            }
            const blob = await zip.generateAsync({ type: 'blob' });
            const ts = new Date().toISOString().slice(0,19).replace(/[:-]/g,'');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `nvim_config_${ts}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            showStatus('✅ ZIP scaricato.', 'success');
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'danger');
        }
        DOM.downloadBtn.innerHTML = lang === 'it' ? '📦 Scarica ZIP' : '📦 Download ZIP';
        setButtonsEnabled(true);
    }

    // ============================================================
    // Reset
    // ============================================================
    function resetGenerator() {
        if (state.flashTimeout) clearTimeout(state.flashTimeout);
        DOM.previewContainer.classList.remove('flash');
        state.files = null;
        state.selectedPath = null;
        DOM.fileList.innerHTML = `<div class="empty-state">${t.no_files}</div>`;
        DOM.fileContent.innerHTML = `<div class="empty-state">${t.select_file}</div>`;
        DOM.downloadBtn.disabled = true;
        DOM.resetBtn.disabled = true;
        hideStatus();
        showStatus(lang === 'it' ? '🔄 Stato resettato.' : '🔄 State reset.', 'info');
        setTimeout(hideStatus, 2000);
    }

    // ============================================================
    // Inizializzazione
    // ============================================================
    function init() {
        initCustomSelect(DOM.pkgManager, DOM.pkgHidden, function(value) {
            state.pkgValue = value;
            if (state.configLoaded) generateConfig();
        });

        updatePkgOptions();

        // Imposta il valore iniziale come "minimal"
        state.pkgValue = 'minimal';
        updatePkgOptions();
        const hidden = DOM.pkgHidden;
        const valueSpan = DOM.pkgValueDisplay;
        const options = DOM.pkgOptions;
        const selected = options.querySelector(`.select-option[data-value="minimal"]`);
        if (selected) {
            valueSpan.textContent = selected.textContent;
            hidden.value = 'minimal';
            options.querySelectorAll('.select-option').forEach(el => el.classList.remove('selected'));
            selected.classList.add('selected');
        }

        DOM.generateBtn.addEventListener('click', generateConfig);
        DOM.downloadBtn.addEventListener('click', downloadZip);
        DOM.resetBtn.addEventListener('click', resetGenerator);
        DOM.chkNoComments.addEventListener('change', generateConfig);
        DOM.chkArchive.addEventListener('change', () => setButtonsEnabled(true));

        loadConfig();
    }

    init();
})();