use anyhow::Error;
use hyper::{Body, Request, Response};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct EdgeUserRuntimeOpts {
    pub life_time_ms: u64,
    pub key: Option<Uuid>,
    pub pool_msg_tx: Option<mpsc::UnboundedSender<UserWorkerMsgs>>,
}

#[derive(Debug, Clone)]
pub struct EdgeMainRuntimeOpts {
    pub worker_pool_tx: mpsc::UnboundedSender<UserWorkerMsgs>,
}

#[derive(Debug, Clone)]
pub enum EdgeContextOpts {
    UserWorker(EdgeUserRuntimeOpts),
    MainWorker(EdgeMainRuntimeOpts),
}

#[derive(Debug, Clone)]
pub struct EdgeContextInitOpts {
    pub service_path: PathBuf,
    pub no_module_cache: bool,
    pub import_map_path: Option<String>,
    pub env_vars: HashMap<String, String>,
    pub conf: EdgeContextOpts,
}

impl Default for EdgeUserRuntimeOpts {
    fn default() -> EdgeUserRuntimeOpts {
        EdgeUserRuntimeOpts {
            life_time_ms: 365 * 24 * 60 * 60 * 1000,
            key: None,
            pool_msg_tx: None,
        }
    }
}

#[derive(Debug)]
pub enum UserWorkerMsgs {
    Create(
        EdgeContextInitOpts,
        oneshot::Sender<Result<CreateUserWorkerResult, Error>>,
    ),
    SendRequest(
        Uuid,
        Request<Body>,
        oneshot::Sender<Result<Response<Body>, Error>>,
    ),
    Shutdown(Uuid),
}

#[derive(Debug)]
pub struct CreateUserWorkerResult {
    pub key: Uuid,
}
