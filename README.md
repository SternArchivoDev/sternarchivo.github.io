# StitchVim — Core Engine

> A high‑performance, modular core written in Rust designed to programmatically generate, deploy, and manage Neovim configurations.

[![Build and Release](https://github.com/TheCGuy73/StitchVim/actions/workflows/build-and-release.yml/badge.svg)](https://github.com/TheCGuy73/StitchVim/actions/workflows/build-and-release.yml)

## 📖 About

**StitchVim** is a Rust‑based tool that programmatically generates, deploys, and manages Neovim configurations. Instead of manually writing and maintaining complex `init.lua` or `init.[...]

The project is built with Rust for performance and reliability, providing a solid foundation for configuration generation. It features a modular architecture with dedicated components for configuratio[...]

## ✨ Features

- 🔧 **Programmatic Configuration** – Define Neovim settings using Rust code instead of manual Lua/Vimscript
- 🚀 **Fast Generation** – Built in Rust for high performance
- 📦 **Modular Architecture** – Clean separation of concerns with dedicated modules for config, generation, and server logic
- 🖥️ **Cross‑Platform** – Builds for Linux and Windows (with cross‑compilation support)
- 🔄 **CI/CD Ready** – Automated builds and releases via GitHub Actions
- 🌐 **HTTP Daemon** – Exposes a REST API for remote configuration generation
- 📦 **Multiple Package Managers** – Supports lazy.nvim, packer.nvim, minimal, and custom setups

## 🏗️ Core Architecture

The engine is built around a clean separation of concerns, dividing execution logic into four distinct modules:

### `main.rs` – CLI & Entry Point
Powered by [`clap`](https://crates.io/crates/clap), it parses command‑line flags:
- `--deploy` – directly deploy to the standard XDG config path
- `--output <path>` – export the generated config to a custom directory
- `--run` – spawn a managed Neovim instance with the generated config
- `--dry-run` – preview the generated files without writing to disk

If no flags are provided, the program starts an HTTP daemon.

### `generator.rs` – Generation Pipeline
Manages temporary directory workspaces, assembles configuration skeletons (including `init.lua` and user modules), and handles target directory deployment or atomic overwrites.

### `server.rs` – HTTP Daemon
Built with [`hyper`](https://crates.io/crates/hyper) and [`tokio`](https://crates.io/crates/tokio), it exposes an asynchronous REST endpoint:
- `POST /generate` – accepts a JSON payload (`GenerateRequestJson`) and triggers a remote build, returning the generated configuration or deployment status.

### `config.rs` & `types.rs` – Data & Constants
Defines shared domain models, package manager variants (`lazy`, `packer`, `minimal`, `other`), code snippets, and serialization structures.

## ⚙️ Execution Flow

1. **Input Reception**  
   The program accepts parameters either via CLI arguments or an incoming HTTP JSON request (`GenerateRequestJson`).

2. **Skeleton Synthesis**  
   A temporary directory structure is populated with:
   - Base options and bootstrap scripts for the chosen package manager
   - Custom user modules (provided via the request or CLI)

3. **Target Deployment**  
   Depending on user directives, the generated configuration is:
   - Deployed directly to the standard `XDG_CONFIG_HOME` path (e.g., `~/.config/nvim/`)
   - Exported to a custom output directory
   - Executed on‑the‑fly by spawning a managed Neovim instance

4. **Validation & Cleanup**  
   The generated `init.lua` and associated files are validated for syntax errors (optional) and temporary workspaces are cleaned up unless `--dry-run` is used.
