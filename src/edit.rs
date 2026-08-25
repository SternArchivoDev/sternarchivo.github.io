//! Adapter for the Kibi editor (customized).

use anyhow::{bail, Result};
use std::path::Path;
use std::env;

/// Launches the Kibi editor with a custom title.
pub fn run_editor(path: Option<&Path>) -> Result<()> {
    if !atty::is(atty::Stream::Stdout) {
        bail!("Not a terminal");
    }

    let stvim_version = env!("CARGO_PKG_VERSION");
    let title = format!("stvim edit.{} (CORE: Kibi)", stvim_version);
    env::set_var("KIBI_TITLE", &title);

    let mut stdin = kibi::stdin()?;
    let filename = path
        .map(|p| {
            p.to_str()
                .ok_or_else(|| anyhow::anyhow!("Invalid file path: contains non-UTF-8 characters"))
        })
        .transpose()?;

    if let Err(e) = kibi::run(filename, &mut stdin) {
        bail!("Kibi editor error: {:?}", e);
    }

    Ok(())
}