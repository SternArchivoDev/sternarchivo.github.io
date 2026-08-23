//! Tipi condivisi tra generazione e server

use crate::config::PackageManager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------- RISULTATO GENERAZIONE ----------
pub struct GenerationResult {
    pub success: bool,
    pub result_path: Option<PathBuf>,
    pub error_msg: Option<String>,
}

// ---------- RICHIESTA JSON PER IL SERVER ----------
#[derive(Debug, Deserialize)]
pub struct GenerateRequestJson {
    #[serde(default)]
    pub package_manager: Option<PackageManager>,
    #[serde(default)]
    pub deploy: bool,
    #[serde(default)]
    pub run: bool,
    #[serde(default)]
    pub output_dir: Option<String>,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub quiet: bool,
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default)]
    pub no_comments: bool,
    #[serde(default)]
    pub keep: bool,
}

// ---------- RISPOSTA JSON PER IL SERVER ----------
#[derive(Debug, Serialize)]
pub struct GenerateResponseJson {
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}