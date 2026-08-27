use crate::config::PackageManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

pub struct GenerationResult {
    pub success: bool,
    pub result_path: Option<PathBuf>,
    pub error_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GenerateRequestJson {
    #[serde(default, rename = "packageManager")]
    pub package_manager_camel: Option<PackageManager>,
    #[serde(default)]
    pub package_manager: Option<PackageManager>, // supporto per snake_case
    #[serde(default)]
    pub deploy: bool,
    #[serde(default)]
    pub run: bool,
    #[serde(default, rename = "outputDir")]
    pub output_dir_camel: Option<String>,
    #[serde(default)]
    pub output_dir: Option<String>,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub quiet: bool,
    #[serde(default, rename = "dryRun")]
    pub dry_run_camel: bool,
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default, rename = "noComments")]
    pub no_comments_camel: bool,
    #[serde(default)]
    pub no_comments: bool,
    #[serde(default)]
    pub keep: bool,
    #[serde(default)]
    pub archive: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub functions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct GenerateResponseJson {
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<HashMap<String, String>>,
}
