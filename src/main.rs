//! Neovim Configuration Generator – v0.1.0 (Rust)
//! Punto di ingresso – CLI e avvio server

use clap::{Parser, Subcommand, CommandFactory};
use std::path::PathBuf;

use neovim_config_generator::{config::{DEFAULT_LISTEN_ADDRESS, DEFAULT_LISTEN_PORT, PROGRAM_NAME, PROGRAM_VERSION, PackageManager}, run_generation, run_server};

// ---------- CLI ARGS ----------
#[derive(Parser)]
#[command(
    name = PROGRAM_NAME,
    version = PROGRAM_VERSION,
    long_about = None
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    #[arg(short, long, value_enum, default_value = "lazy")]
    package_manager: PackageManager,

    #[arg(short = 'd', long)]
    deploy: bool,

    #[arg(short = 'o', long)]
    output: Option<PathBuf>,

    #[arg(short = 'r', long)]
    run: bool,

    #[arg(short = 'f', long)]
    force: bool,

    #[arg(short = 'q', long)]
    quiet: bool,

    #[arg(short = 'D', long)]
    dry_run: bool,

    #[arg(short = 'N', long)]
    no_comments: bool,

    #[arg(short = 'K', long)]
    keep: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Start HTTP server
    Listen {
        #[arg(long, default_value = DEFAULT_LISTEN_ADDRESS)]
        address: String,
        #[arg(long, default_value_t = DEFAULT_LISTEN_PORT)]
        port: u16,
    },
}

// ---------- MAIN ----------
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Se non viene specificato alcun comando o azione, mostra l'help
    if cli.command.is_none()
        && !cli.deploy
        && cli.output.is_none()
        && !cli.run
        && !cli.dry_run
        && !cli.quiet
        && !cli.force
        && !cli.keep
        && !cli.no_comments
    {
        let _ = Cli::command().print_help();
        println!();
        return Ok(());
    }

    match cli.command {
        Some(Commands::Listen { address, port }) => {
            run_server(&address, port).await?;
        }
        None => {
            if !cli.deploy && cli.output.is_none() && !cli.run {
                eprintln!(
                    "Error: at least one of --deploy, --output, or --run is required.\nTry --help."
                );
                std::process::exit(1);
            }

            let result = run_generation(
                cli.package_manager,
                cli.deploy,
                cli.run,
                cli.output.as_deref(),
                cli.force,
                cli.quiet,
                cli.dry_run,
                cli.no_comments,
                cli.keep,
            );

            if !result.success {
                eprintln!(
                    "Error: {}",
                    result.error_msg.unwrap_or_else(|| "Unknown error".to_string())
                );
                std::process::exit(1);
            }

            if !cli.dry_run && !cli.quiet {
                if let Some(path) = result.result_path {
                    println!("✅ Configuration generated at: {}", path.display());
                }
            }
        }
    }

    Ok(())
}