//! Neovim Configuration Generator – modulo principale

pub mod config;
pub mod generator;
pub mod server;
pub mod types;

// Ri-esporta i tipi più usati per comodità
pub use config::PackageManager;
pub use generator::run_generation;
pub use server::run_server;
pub use types::GenerationResult;