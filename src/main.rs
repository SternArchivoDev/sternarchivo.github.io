//! StitchVim – v0.0.0-alpha2
//! Punto di ingresso – CLI e avvio server

use clap::{CommandFactory, Parser, Subcommand};
use std::path::PathBuf;
use stvim::{
    config::{
        PackageManager, DEFAULT_LISTEN_ADDRESS, DEFAULT_LISTEN_PORT, PROGRAM_NAME, PROGRAM_VERSION,
    },
    run_generation, run_server,
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
    // Il comando Edit è stato rimosso
}

#[derive(Subcommand)]
enum ServerAction {
    /// Start the server on all interfaces with a random port
    Start {
        #[arg(short, long, default_value = "0.0.0.0")]
        address: String,
    },
    /// Stop the server (not implemented yet)
    Stop,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Listen { address, port }) => {
            let bound = run_server(&address, port).await?;
            println!("✅ Server started at: {}", bound);
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
        None => {
            // Se non è stato specificato alcun comando, determiniamo l'azione
            let archive_mode = !cli.deploy && cli.output.is_none() && !cli.run;

            // Se non ci sono flag di azione e non è dry-run, generiamo un archivio
            // (dry-run non crea l'archivio, ma mostra solo il percorso temporaneo)
            let do_archive = archive_mode && !cli.dry_run;

            if !cli.deploy && cli.output.is_none() && !cli.run && !do_archive && !cli.dry_run {
                // Se non viene richiesta nessuna azione, mostriamo l'help
                let _ = Cli::command().print_help();
                println!();
                return Ok(());
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
                do_archive, // nuovo parametro
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
                    if do_archive {
                        println!("✅ Archive created at: {}", path.display());
                    } else {
                        println!("✅ Configuration generated at: {}", path.display());
                    }
                }
            }
            Ok(())
        }
    }
}