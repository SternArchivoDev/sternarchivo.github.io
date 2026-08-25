//! Editor di testo TUI minimale con le funzionalità essenziali.
//! Supporto per: raw mode, buffer (Rope), rendering dirty, Unicode/graphemi,
//! salvataggio atomico, undo/redo, ridimensionamento con crossterm.

use anyhow::{bail, Result};
use crossterm::{
    cursor::{MoveTo, Show, Hide},
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers},
    execute,
    terminal::{self, Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen},
};
use ropey::Rope;
use std::io::{stdout, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::{fs};
use unicode_segmentation::UnicodeSegmentation;

// ---------- STATO DELL'EDITORE ----------
pub struct Editor {
    rope: Rope,                     // buffer principale (Piece Table tramite ropey)
    filename: Option<PathBuf>,      // file aperto, se presente
    cursor: Cursor,                 // posizione del cursore
    top_line: usize,                // prima riga visibile
    width: u16,                     // larghezza terminale
    height: u16,                    // altezza terminale
    modified: bool,                 // modificato dall'ultimo salvataggio
    insert_mode: bool,              // true = modalità inserimento, false = modalità comando
    undo_stack: Vec<EditAction>,    // per undo/redo
    redo_stack: Vec<EditAction>,
}

// Posizione del cursore (in byte e riga)
#[derive(Clone, Copy)]
struct Cursor {
    line: usize,
    col: usize,     // indice in byte all'interno della riga
}

// Azione di modifica per undo/redo (semplice differenza)
#[derive(Clone)]
enum EditAction {
    Insert { line: usize, col: usize, text: String },
    Delete { line: usize, col: usize, text: String },
}

impl Editor {
    pub fn new() -> Self {
        let (w, h) = terminal::size().unwrap_or((80, 24));
        Self {
            rope: Rope::from(""),
            filename: None,
            cursor: Cursor { line: 0, col: 0 },
            top_line: 0,
            width: w,
            height: h,
            modified: false,
            insert_mode: false,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    // Carica un file nel buffer (se esiste)
    pub fn load_file(&mut self, path: &Path) -> Result<()> {
        let content = fs::read_to_string(path)?;
        self.rope = Rope::from(content);
        self.filename = Some(path.to_path_buf());
        self.cursor = Cursor { line: 0, col: 0 };
        self.top_line = 0;
        self.modified = false;
        self.undo_stack.clear();
        self.redo_stack.clear();
        Ok(())
    }

    // Salvataggio atomico: scrive su file temporaneo e rinomina
    pub fn save(&mut self) -> Result<()> {
        let path = match &self.filename {
            Some(p) => p,
            None => bail!("No file name set; use :save <path> or start with a file"),
        };
        let tmp_path = path.with_extension("tmp");
        fs::write(&tmp_path, self.rope.to_string())?;
        fs::rename(&tmp_path, path)?;
        self.modified = false;
        Ok(())
    }

    // Inserisci testo alla posizione corrente
    pub fn insert_text(&mut self, text: &str) {
        let line = self.cursor.line;
        let col = self.cursor.col;
        if line >= self.rope.len_lines() {
            // aggiunge righe vuote fino a raggiungere la linea
            for _ in self.rope.len_lines()..=line {
                self.rope.insert(self.rope.len_bytes(), "\n");
            }
        }
        let total_bytes = self.rope.line_to_byte(line) + col;
        self.rope.insert(total_bytes, text);
        self.cursor.col += text.len();
        self.modified = true;
        // Registra per undo
        self.undo_stack.push(EditAction::Insert {
            line,
            col,
            text: text.to_string(),
        });
        self.redo_stack.clear();
    }

    // Cancella il carattere precedente al cursore (backspace)
    pub fn backspace(&mut self) {
        let line = self.cursor.line;
        let col = self.cursor.col;
        if col == 0 && line == 0 {
            return; // niente da cancellare
        }
        if col > 0 {
            // cancelliamo un carattere (grapheme)
            let byte_idx = self.rope.line_to_byte(line) + col;
            // Prendiamo la slice come stringa e poi i graphemi
            let slice_str = self.rope.slice(byte_idx..).to_string();
            let mut graphemes = slice_str.graphemes(true);
            if let Some(gr) = graphemes.next() {
                let len = gr.len();
                self.rope.remove(byte_idx - len..byte_idx);
                self.cursor.col -= len;
                self.modified = true;
                self.undo_stack.push(EditAction::Delete {
                    line,
                    col: col - len,
                    text: gr.to_string(),
                });
                self.redo_stack.clear();
            }
        } else {
            // siamo a inizio riga: unisci con la precedente
            let prev_line = line - 1;
            let prev_len = self.rope.line_to_byte(prev_line + 1) - self.rope.line_to_byte(prev_line);
            let byte_idx = self.rope.line_to_byte(line);
            let newline = self.rope.slice(byte_idx..byte_idx+1).to_string();
            if newline == "\n" {
                self.rope.remove(byte_idx..byte_idx+1);
                self.cursor.line = prev_line;
                self.cursor.col = prev_len - 1; // -1 per il newline rimosso
                self.modified = true;
                self.undo_stack.push(EditAction::Delete {
                    line: prev_line,
                    col: prev_len - 1,
                    text: "\n".to_string(),
                });
                self.redo_stack.clear();
            }
        }
    }

    // Cancella il carattere sotto il cursore (delete)
    pub fn delete(&mut self) {
        let line = self.cursor.line;
        let col = self.cursor.col;
        if line >= self.rope.len_lines() {
            return;
        }
        let byte_idx = self.rope.line_to_byte(line) + col;
        if byte_idx >= self.rope.len_bytes() {
            return;
        }
        let slice_str = self.rope.slice(byte_idx..).to_string();
        let mut graphemes = slice_str.graphemes(true);
        if let Some(gr) = graphemes.next() {
            let len = gr.len();
            self.rope.remove(byte_idx..byte_idx+len);
            self.modified = true;
            self.undo_stack.push(EditAction::Delete {
                line,
                col,
                text: gr.to_string(),
            });
            self.redo_stack.clear();
        }
    }

    // Undo
    pub fn undo(&mut self) {
        if let Some(action) = self.undo_stack.pop() {
            match action {
                EditAction::Insert { line, col, text } => {
                    let byte_idx = self.rope.line_to_byte(line) + col;
                    self.rope.remove(byte_idx..byte_idx+text.len());
                    self.cursor = Cursor { line, col };
                    self.redo_stack.push(EditAction::Insert { line, col, text });
                }
                EditAction::Delete { line, col, text } => {
                    let byte_idx = self.rope.line_to_byte(line) + col;
                    self.rope.insert(byte_idx, &text);
                    self.cursor = Cursor { line, col };
                    self.redo_stack.push(EditAction::Delete { line, col, text });
                }
            }
            self.modified = true;
        }
    }

    // Redo
    pub fn redo(&mut self) {
        if let Some(action) = self.redo_stack.pop() {
            match action {
                EditAction::Insert { line, col, text } => {
                    let byte_idx = self.rope.line_to_byte(line) + col;
                    self.rope.insert(byte_idx, &text);
                    self.cursor = Cursor { line, col: col + text.len() };
                    self.undo_stack.push(EditAction::Insert { line, col, text });
                }
                EditAction::Delete { line, col, text } => {
                    let byte_idx = self.rope.line_to_byte(line) + col;
                    self.rope.remove(byte_idx..byte_idx+text.len());
                    self.cursor = Cursor { line, col };
                    self.undo_stack.push(EditAction::Delete { line, col, text });
                }
            }
            self.modified = true;
        }
    }

    // Ridimensiona il terminale
    pub fn resize(&mut self, width: u16, height: u16) {
        self.width = width;
        self.height = height;
        // Assicura che il cursore sia visibile
        if self.cursor.line < self.top_line {
            self.top_line = self.cursor.line;
        } else if self.cursor.line >= self.top_line + (height as usize) - 1 {
            self.top_line = self.cursor.line - (height as usize) + 2;
        }
    }

    // Renderizza lo schermo (solo le righe visibili)
    pub fn render(&mut self) -> Result<()> {
        let mut stdout = stdout();
        execute!(stdout, Clear(ClearType::All))?;

        let mut line_num = 0;
        let start = self.top_line;
        let end = std::cmp::min(self.rope.len_lines(), start + (self.height as usize) - 1);
        for i in start..end {
            let line = self.rope.line(i);
            let text = line.to_string();
            // Tronca alla larghezza del terminale
            let display = if text.len() > self.width as usize {
                &text[..self.width as usize]
            } else {
                &text
            };
            execute!(stdout, MoveTo(0, line_num))?;
            write!(stdout, "{}", display)?;
            line_num += 1;
        }
        // Mostra il cursore
        let cursor_line = (self.cursor.line - self.top_line) as u16;
        let cursor_col = self.cursor.col as u16;
        execute!(stdout, MoveTo(cursor_col, cursor_line), Show)?;
        stdout.flush()?;
        Ok(())
    }

    // Ciclo principale dell'editor
    pub fn run(&mut self) -> Result<()> {
        let mut stdout = stdout();
        terminal::enable_raw_mode()?;
        execute!(stdout, EnterAlternateScreen, Hide)?;

        let result = self.event_loop();

        // Pulizia
        execute!(stdout, LeaveAlternateScreen, Show)?;
        terminal::disable_raw_mode()?;
        result
    }

    // Event loop con gestione del resize via crossterm
    fn event_loop(&mut self) -> Result<()> {
        loop {
            // Renderizza
            self.render()?;

            // Leggi evento (timeout per gestire ridimensionamenti senza blocco)
            if event::poll(Duration::from_millis(50))? {
                match event::read()? {
                    Event::Key(key) => {
                        if self.handle_key(key)? {
                            break; // esce
                        }
                    }
                    Event::Resize(w, h) => {
                        self.resize(w, h);
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }

    // Gestione tasti: ritorna true se si deve uscire
    fn handle_key(&mut self, key: KeyEvent) -> Result<bool> {
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);

        // Comandi globali
        if ctrl && key.code == KeyCode::Char('c') {
            return Ok(true); // Ctrl+C esce
        }
        if ctrl && key.code == KeyCode::Char('s') {
            self.save()?;
            return Ok(false);
        }
        if ctrl && key.code == KeyCode::Char('z') {
            self.undo();
            return Ok(false);
        }
        if ctrl && key.code == KeyCode::Char('y') {
            self.redo();
            return Ok(false);
        }

        if self.insert_mode {
            match key.code {
                KeyCode::Char(c) => {
                    self.insert_text(&c.to_string());
                }
                KeyCode::Backspace => {
                    self.backspace();
                }
                KeyCode::Delete => {
                    self.delete();
                }
                KeyCode::Enter => {
                    self.insert_text("\n");
                    self.cursor.line += 1;
                    self.cursor.col = 0;
                }
                KeyCode::Tab => {
                    self.insert_text("    "); // 4 spazi
                }
                KeyCode::Esc => {
                    self.insert_mode = false;
                }
                KeyCode::Left => {
                    if self.cursor.col > 0 {
                        self.cursor.col -= 1;
                    } else if self.cursor.line > 0 {
                        self.cursor.line -= 1;
                        self.cursor.col = self.rope.line_to_byte(self.cursor.line+1)
                            - self.rope.line_to_byte(self.cursor.line) - 1;
                    }
                }
                KeyCode::Right => {
                    let line_len = self.rope.line_to_byte(self.cursor.line+1)
                        - self.rope.line_to_byte(self.cursor.line);
                    if self.cursor.col < line_len {
                        self.cursor.col += 1;
                    } else if self.cursor.line < self.rope.len_lines() - 1 {
                        self.cursor.line += 1;
                        self.cursor.col = 0;
                    }
                }
                KeyCode::Up => {
                    if self.cursor.line > 0 {
                        self.cursor.line -= 1;
                        let len = self.rope.line_to_byte(self.cursor.line+1)
                            - self.rope.line_to_byte(self.cursor.line);
                        if self.cursor.col > len {
                            self.cursor.col = len;
                        }
                    }
                }
                KeyCode::Down => {
                    if self.cursor.line < self.rope.len_lines() - 1 {
                        self.cursor.line += 1;
                        let len = self.rope.line_to_byte(self.cursor.line+1)
                            - self.rope.line_to_byte(self.cursor.line);
                        if self.cursor.col > len {
                            self.cursor.col = len;
                        }
                    }
                }
                _ => {}
            }
        } else {
            // Modalità comando (stile Vim semplificato)
            match key.code {
                KeyCode::Char('i') => {
                    self.insert_mode = true;
                }
                KeyCode::Char('a') => {
                    // append: sposta cursore a fine riga e attiva insert
                    let len = self.rope.line_to_byte(self.cursor.line+1)
                        - self.rope.line_to_byte(self.cursor.line);
                    self.cursor.col = len;
                    self.insert_mode = true;
                }
                KeyCode::Char('h') => {
                    if self.cursor.col > 0 {
                        self.cursor.col -= 1;
                    }
                }
                KeyCode::Char('j') => {
                    if self.cursor.line < self.rope.len_lines() - 1 {
                        self.cursor.line += 1;
                        let len = self.rope.line_to_byte(self.cursor.line+1)
                            - self.rope.line_to_byte(self.cursor.line);
                        if self.cursor.col > len {
                            self.cursor.col = len;
                        }
                    }
                }
                KeyCode::Char('k') => {
                    if self.cursor.line > 0 {
                        self.cursor.line -= 1;
                        let len = self.rope.line_to_byte(self.cursor.line+1)
                            - self.rope.line_to_byte(self.cursor.line);
                        if self.cursor.col > len {
                            self.cursor.col = len;
                        }
                    }
                }
                KeyCode::Char('l') => {
                    let len = self.rope.line_to_byte(self.cursor.line+1)
                        - self.rope.line_to_byte(self.cursor.line);
                    if self.cursor.col < len {
                        self.cursor.col += 1;
                    }
                }
                KeyCode::Char('x') => {
                    self.delete();
                }
                KeyCode::Char('d') => {
                    // delete line (semplice)
                    let line = self.cursor.line;
                    let byte_start = self.rope.line_to_byte(line);
                    let byte_end = self.rope.line_to_byte(line+1);
                    let text = self.rope.slice(byte_start..byte_end).to_string();
                    self.rope.remove(byte_start..byte_end);
                    if line < self.rope.len_lines() {
                        self.cursor.line = line;
                        self.cursor.col = 0;
                    } else {
                        self.cursor.line = self.rope.len_lines() - 1;
                        self.cursor.col = 0;
                    }
                    self.modified = true;
                    self.undo_stack.push(EditAction::Delete {
                        line,
                        col: 0,
                        text,
                    });
                    self.redo_stack.clear();
                }
                KeyCode::Char('u') => {
                    self.undo();
                }
                KeyCode::Char('r') => {
                    self.redo();
                }
                _ => {}
            }
        }
        // Assicura che il cursore rimanga nei limiti
        let max_line = self.rope.len_lines().saturating_sub(1);
        if self.cursor.line > max_line {
            self.cursor.line = max_line;
        }
        let max_col = self.rope.line_to_byte(self.cursor.line+1)
            - self.rope.line_to_byte(self.cursor.line);
        if self.cursor.col > max_col {
            self.cursor.col = max_col;
        }
        // Scorrimento automatico
        if self.cursor.line < self.top_line {
            self.top_line = self.cursor.line;
        } else if self.cursor.line >= self.top_line + (self.height as usize) - 1 {
            self.top_line = self.cursor.line - (self.height as usize) + 2;
        }
        Ok(false)
    }
}

// ---------- FUNZIONE PUBBLICA PER AVVIARE L'EDITORE ----------
pub fn run_editor(file: Option<&Path>, _force: bool, quiet: bool) -> Result<()> {
    let mut editor = Editor::new();
    if let Some(path) = file {
        if path.exists() {
            editor.load_file(path)?;
        } else {
            if !quiet {
                eprintln!("File does not exist, creating new buffer.");
            }
            editor.filename = Some(path.to_path_buf());
        }
    }
    if !quiet {
        eprintln!("Editor started. Type 'i' to insert, 'Esc' to command mode. Ctrl+C to quit.");
        eprintln!("Ctrl+S save, Ctrl+Z undo, Ctrl+Y redo.");
    }
    editor.run()
}