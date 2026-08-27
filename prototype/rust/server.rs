//! Server HTTP con Axum – protocollo per il frontend

use crate::generator::run_generation;
use crate::types::GenerateRequestJson;
use anyhow::Result;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, get_service, post};
use axum::{Json, Router};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::Semaphore;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

// Stato condiviso del server
struct AppState {
    semaphore: Arc<Semaphore>,
}

// ------------------------------
// Endpoint /ping
// ------------------------------
async fn ping() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

// ------------------------------
// Endpoint /metadata
// ------------------------------
async fn metadata() -> impl IntoResponse {
    let tags = vec![
        "neovim".to_string(),
        "lsp".to_string(),
        "treesitter".to_string(),
        "completion".to_string(),
        "debug".to_string(),
    ];
    let functions = vec![
        "setup".to_string(),
        "config".to_string(),
        "init".to_string(),
        "bootstrap".to_string(),
    ];
    (
        StatusCode::OK,
        Json(json!({ "tags": tags, "functions": functions })),
    )
}

// ------------------------------
// Endpoint /generate
// ------------------------------
async fn generate(
    State(state): State<Arc<AppState>>,
    Json(mut payload): Json<GenerateRequestJson>,
) -> impl IntoResponse {
    // Limita la concorrenza
    let _permit = match state.semaphore.try_acquire() {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "error",
                    "message": "Server busy, too many concurrent requests"
                })),
            );
        }
    };

    // Normalizza i nomi dei campi (frontend usa camelCase)
    if payload.package_manager.is_none() && payload.package_manager_camel.is_some() {
        payload.package_manager = payload.package_manager_camel;
    }

    // Se non è specificato alcun output_dir, usiamo una directory persistente
    let output_dir = payload.output_dir.clone().unwrap_or_else(|| {
        let dir = std::env::temp_dir().join(format!(
            "stitchvim_gen_{}",
            chrono::Local::now().timestamp()
        ));
        dir.to_string_lossy().to_string()
    });

    // Forziamo keep = true per evitare la cancellazione prima di leggere i file
    payload.keep = true;

    // Chiamata alla funzione di generazione
    let result = run_generation(
        payload.package_manager.unwrap_or_default(),
        payload.deploy,
        payload.run,
        Some(&PathBuf::from(&output_dir)),
        payload.force,
        payload.quiet,
        payload.dry_run,
        payload.no_comments,
        payload.keep,
        payload.archive,
    );

    if !result.success {
        let msg = result
            .error_msg
            .unwrap_or_else(|| "Unknown error".to_string());
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "status": "error", "message": msg })),
        );
    }

    let final_path = match result.result_path {
        Some(p) => p,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": "No result path returned" })),
            );
        }
    };

    // Leggi tutti i file di configurazione (.lua, .vim, .md)
    let mut files = HashMap::new();
    if final_path.exists() && final_path.is_dir() {
        let walker = walkdir::WalkDir::new(&final_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file());

        for entry in walker {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy();
                if ext == "lua" || ext == "vim" || ext == "md" {
                    if let Ok(content) = fs::read_to_string(path) {
                        let rel_path = path
                            .strip_prefix(&final_path)
                            .unwrap_or(path)
                            .to_str()
                            .unwrap_or("")
                            .replace('\\', "/");
                        files.insert(rel_path, content);
                    }
                }
            }
        }
    }

    if files.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": "No configuration files found in generated directory"
            })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "message": "Configuration generated successfully",
            "files": files
        })),
    )
}

// ------------------------------
// Endpoint /save
// ------------------------------
async fn save(Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    let files = match payload.get("files").and_then(|f| f.as_object()) {
        Some(f) => f,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "status": "error", "message": "Missing 'files' field" })),
            );
        }
    };

    let dest_dir = std::env::var("STVIM_SAVE_DIR")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("generated_config"));

    if let Err(e) = fs::create_dir_all(&dest_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(
                json!({ "status": "error", "message": format!("Failed to create save dir: {}", e) }),
            ),
        );
    }

    for (rel_path, content) in files {
        let full_path = dest_dir.join(rel_path);
        if let Some(parent) = full_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "status": "error",
                        "message": format!("Failed to create parent dirs for {}: {}", rel_path, e)
                    })),
                );
            }
        }
        if let Err(e) = fs::write(&full_path, content.as_str().unwrap_or("")) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": format!("Failed to write {}: {}", rel_path, e)
                })),
            );
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "message": format!("Saved {} files to {}", files.len(), dest_dir.display())
        })),
    )
}

// ------------------------------
// Shutdown graceful
// ------------------------------
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.ok();
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .ok()
            .and_then(|mut s| s.recv().await);
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    eprintln!("\nShutdown signal received, stopping server...");
}

// ------------------------------
// Avvio del server
// ------------------------------
pub async fn run_server(address: &str, port: u16) -> Result<SocketAddr> {
    let addr: SocketAddr = format!("{}:{}", address, port).parse()?;
    let listener = TcpListener::bind(addr).await?;
    let bound_addr = listener.local_addr()?;
    eprintln!("✅ Server listening on {}", bound_addr);

    // Middleware CORS – permette richieste da qualsiasi origine (per sviluppo)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = Arc::new(AppState {
        semaphore: Arc::new(Semaphore::new(10)),
    });

    let app = Router::new()
        .route("/ping", get(ping))
        .route("/metadata", get(metadata))
        .route("/generate", post(generate))
        .route("/save", post(save))
        // Serve file statici dalla cartella "static" come fallback
        .fallback(get_service(ServeDir::new("static/headers")))
        .layer(cors)
        .with_state(state);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    eprintln!("Server stopped.");
    Ok(bound_addr)
}
