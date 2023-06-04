use crate::worker_ctx::{create_user_worker_pool, create_worker, WorkerRequestMsg};
use anyhow::{anyhow, Error};
use hyper::{server::conn::Http, service::Service, Body, Request, Response};
use log::{debug, error, info};
use sb_worker_context::essentials::{EdgeContextInitOpts, EdgeContextOpts, EdgeMainRuntimeOpts};
use std::future::Future;
use std::net::IpAddr;
use std::net::Ipv4Addr;
use std::net::SocketAddr;
use std::path::Path;
use std::pin::Pin;
use std::str;
use std::str::FromStr;
use std::task::Poll;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};

struct WorkerService {
    worker_req_tx: mpsc::UnboundedSender<WorkerRequestMsg>,
}

impl WorkerService {
    fn new(worker_req_tx: mpsc::UnboundedSender<WorkerRequestMsg>) -> Self {
        Self { worker_req_tx }
    }
}

impl Service<Request<Body>> for WorkerService {
    type Response = Response<Body>;
    type Error = anyhow::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut std::task::Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        // create a response in a future.
        let worker_req_tx = self.worker_req_tx.clone();
        let response = async move {
            let req_path = req.uri().path();

            // if the request is for the health endpoint return a 200 OK response
            if req_path == "/_internal/health" {
                return Ok(Response::new(Body::empty()));
            }

            let (res_tx, res_rx) = oneshot::channel::<Result<Response<Body>, hyper::Error>>();
            let msg = WorkerRequestMsg { req, res_tx };

            // Work after blocking request
            worker_req_tx.send(msg)?;

            let result = res_rx.await?;

            match result {
                Ok(res) => Ok(res),
                Err(e) => Err(anyhow!(e)),
            }
        };

        // Return the response as an immediate future
        Box::pin(response)
    }
}

pub struct Server {
    ip: Ipv4Addr,
    port: u16,
    main_worker_req_txs: Vec<mpsc::UnboundedSender<WorkerRequestMsg>>,
    _terminate_txs: Vec<oneshot::Sender<()>>,
}

impl Server {
    pub async fn new(
        ip: &str,
        port: u16,
        main_service_path: String,
        import_map_path: Option<String>,
        no_module_cache: bool,
        num_main_workers: u16,
    ) -> Result<Self, Error> {
        // create a user worker pool
        let user_worker_msgs_tx = create_user_worker_pool().await?;

        // create main worker
        let main_path = Path::new(&main_service_path);
        let mut main_worker_req_txs: Vec<mpsc::UnboundedSender<WorkerRequestMsg>> =
            Vec::with_capacity(num_main_workers as usize);
        let mut _terminate_txs: Vec<oneshot::Sender<()>> =
            Vec::with_capacity(num_main_workers as usize);

        // create main workers
        for _ in 0..num_main_workers {
            let import_map_path_clone = import_map_path.clone();
            let (main_worker_req_tx, terminate_tx) = create_worker(EdgeContextInitOpts {
                service_path: main_path.to_path_buf(),
                import_map_path: import_map_path_clone,
                no_module_cache,
                conf: EdgeContextOpts::MainWorker(EdgeMainRuntimeOpts {
                    worker_pool_tx: user_worker_msgs_tx.clone(),
                }),
                env_vars: std::env::vars().collect(),
            })
            .await?;

            main_worker_req_txs.push(main_worker_req_tx);
            _terminate_txs.push(terminate_tx);
        }

        let ip = Ipv4Addr::from_str(ip)?;
        Ok(Self {
            ip,
            port,
            main_worker_req_txs,
            _terminate_txs,
        })
    }

    pub async fn listen(&mut self) -> Result<(), Error> {
        let addr = SocketAddr::new(IpAddr::V4(self.ip), self.port);
        let listener = TcpListener::bind(&addr).await?;
        debug!("Deno runtime is listening on {:?}", listener.local_addr()?);

        loop {
            let main_worker_req_tx_clone;

            if self.main_worker_req_txs.len() > 1 {
                let main_worker_req_tx = self.main_worker_req_txs.remove(0);
                main_worker_req_tx_clone = main_worker_req_tx.clone();
                self.main_worker_req_txs.push(main_worker_req_tx);
            } else {
                main_worker_req_tx_clone = self.main_worker_req_txs.get(0).unwrap().clone();
            }

            tokio::select! {
                msg = listener.accept() => {
                    match msg {
                        Ok((conn, _)) => {
                            tokio::spawn(async move {
                                let service = WorkerService::new(main_worker_req_tx_clone);

                                let connection = Http::new()
                                    .serve_connection(conn, service);

                                if let Err(e) = connection.await {
                                    error!("{:?}", e);
                                }
                            });
                       }
                       Err(e) => error!("Socket error: {}", e)
                    }
                }
                // wait for shutdown signal...
                _ = tokio::signal::ctrl_c() => {
                    info!("Shutdown signal received...");
                    break;
                }
            }
        }
        Ok(())
    }
}
