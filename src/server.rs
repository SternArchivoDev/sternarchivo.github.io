//! Server HTTP con Hyper

// ... (le altre parti rimangono invariate) ...

async fn handle_generate(req: Request<hyper::body::Incoming>) -> Result<Response<ResponseBody>> {
    // ... parsing ...
    let result = run_generation(
        pkg,
        req_json.deploy,
        req_json.run,
        output_dir,
        req_json.force,
        req_json.quiet,
        req_json.dry_run,
        req_json.no_comments,
        req_json.keep,
        false, // archive non supportato dal server per ora
    );
    // ...
}