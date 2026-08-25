//! StitchVim – v0.0.0-alpha2
//! Punto di ingresso – CLI e avvio server

use clap::{CommandFactory, Parser, Subcommand};
use std::path::PathBuf;
use stvim::{
    config::{
        PackageManager, DEFAULT_LISTEN_ADDRESS, DEFAULT_LISTEN_PORT, PROGRAM_NAME, PROGRAM_VERSION,
    },
    run_editor, run_generation, run_server,
};

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
    /// Start HTTP server with manual address and port
    Listen {
        #[arg(long, default_value = DEFAULT_LISTEN_ADDRESS)]
        address: String,
        #[arg(long, default_value_t = DEFAULT_LISTEN_PORT)]
        port: u16,
    },
    /// Manage the HTTP server (start/stop)
    Server {
        #[command(subcommand)]
        action: ServerAction,
    },
    /// Launch the built-in text editor
    Edit {
        /// File to open (optional)
        file: Option<PathBuf>,
        /// Overwrite existing file without confirmation
        #[arg(short, long)]
        force: bool,
        /// Suppress output messages
        #[arg(short, long)]
        quiet: bool,
    },
}

#[derive(Subcommand)]
enum ServerAction {
    /// Start the server on all interfaces with a random port
    Start {
        /// Bind address (default: 0.0.0.0)
        #[arg(short, long, default_value = "0.0.0.0")]
        address: String,
    },
    /// Stop the server (not implemented yet)
    Stop,
}

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
            let bound = run_server(&address, port).await?;
            println!("✅ Server started at: {}", bound);
            // Il server rimane in esecuzione (run_server non blocca perché spawna un task)
            // Attendiamo che il server termini (in realtà non termina mai finché non si interrompe il programma)
            tokio::signal::ctrl_c().await?;
            eprintln!("Server stopped.");
            Ok(())
        }
        Some(Commands::Server { action }) => match action {
            ServerAction::Start { address } => {
                let bound = run_server(&address, 0).await?;
                println!("✅ Server started at: {}", bound);
                tokio::signal::ctrl_c().await?;
                eprintln!("Server stopped.");
                Ok(())
            }
            ServerAction::Stop => {
                eprintln!("Stop command not implemented yet.");
                Ok(())
            }
        },
        Some(Commands::Edit { file, .. }) => {
            run_editor(file.as_deref())?;
            Ok(())
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
                    result
                        .error_msg
                        .unwrap_or_else(|| "Unknown error".to_string())
                );
                std::process::exit(1);
            }

            if !cli.dry_run && !cli.quiet {
                if let Some(path) = result.result_path {
                    println!("✅ Configuration generated at: {}", path.display());
                }
            }
            Ok(())
        }
    }
}