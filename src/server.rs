//! Server HTTP con Hyper

use crate::generator::run_generation;
use crate::types::{GenerateRequestJson, GenerateResponseJson};
use anyhow::Result;
use hyper::body::{Body, Bytes, Frame};
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::net::TcpListener;

// ---------- BODY PERSONALIZZATO ----------
struct ResponseBody {
    data: Option<Bytes>,
}

impl Body for ResponseBody {
    type Data = Bytes;
    type Error = Infallible;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        Poll::Ready(self.data.take().map(|data| Ok(Frame::data(data))))
    }
}

// ---------- HELPER PER RISPOSTE JSON ----------
fn json_response<T: serde::Serialize>(status: StatusCode, body: &T) -> Response<ResponseBody> {
    let json = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(ResponseBody {
            data: Some(Bytes::from(json)),
        })
        .unwrap()
}

// ---------- HANDLER PER /generate ----------
async fn handle_generate(req: Request<hyper::body::Incoming>) -> Result<Response<ResponseBody>> {
    let mut body = req.into_body();
    let mut body_bytes = Vec::new();
    while let Some(frame) = std::future::poll_fn(|cx| Pin::new(&mut body).poll_frame(cx)).await {
        let frame = frame?;
        if let Some(data) = frame.data_ref() {
            body_bytes.extend_from_slice(data);
        }
    }
    let body_str = String::from_utf8_lossy(&body_bytes);

    let req_json: GenerateRequestJson = match serde_json::from_str(&body_str) {
        Ok(r) => r,
        Err(e) => {
            let resp = GenerateResponseJson {
                status: "error".to_string(),
                message: format!("Invalid JSON: {}", e),
                path: None,
            };
            return Ok(json_response(StatusCode::BAD_REQUEST, &resp));
        }
    };

    let pkg = req_json.package_manager.unwrap_or_default();

    if !req_json.deploy && !req_json.run && req_json.output_dir.is_none() {
        let resp = GenerateResponseJson {
            status: "error".to_string(),
            message: "At least one of deploy, run, or output_dir is required".to_string(),
            path: None,
        };
        return Ok(json_response(StatusCode::BAD_REQUEST, &resp));
    }

    let output_dir_path = req_json
        .output_dir
        .as_deref()
        .map(std::path::PathBuf::from);
    let output_dir = output_dir_path.as_deref();

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
    );

    let (status, resp) = if result.success {
        (
            StatusCode::OK,
            GenerateResponseJson {
                status: "ok".to_string(),
                message: "Configuration generated".to_string(),
                path: result.result_path.map(|p| p.display().to_string()),
            },
        )
    } else {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            GenerateResponseJson {
                status: "error".to_string(),
                message: result.error_msg.unwrap_or_else(|| "Unknown error".to_string()),
                path: None,
            },
        )
    };

    Ok(json_response(status, &resp))
}

// ---------- AVVIO DEL SERVER ----------
pub async fn run_server(address: &str, port: u16) -> Result<()> {
    let addr: std::net::SocketAddr = format!("{}:{}", address, port).parse()?;
    eprintln!("✅ Server listening on {}:{}", address, port);
    let listener = TcpListener::bind(addr).await?;

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(async move {
            let service = hyper::service::service_fn(|req: Request<hyper::body::Incoming>| async {
                if req.method() == hyper::Method::POST && req.uri().path() == "/generate" {
                    match handle_generate(req).await {
                        Ok(resp) => Ok::<_, hyper::Error>(resp),
                        Err(e) => {
                            let err_resp = GenerateResponseJson {
                                status: "error".to_string(),
                                message: format!("Internal error: {}", e),
                                path: None,
                            };
                            Ok(json_response(StatusCode::INTERNAL_SERVER_ERROR, &err_resp))
                        }
                    }
                } else {
                    let err_resp = GenerateResponseJson {
                        status: "error".to_string(),
                        message: "Not Found".to_string(),
                        path: None,
                    };
                    Ok(json_response(StatusCode::NOT_FOUND, &err_resp))
                }
            });

            if let Err(e) = hyper::server::conn::http1::Builder::new()
                .serve_connection(TokioIo::new(stream), service)
                .await
            {
                eprintln!("HTTP connection error: {}", e);
            }
        });
    }
}