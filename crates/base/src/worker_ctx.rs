use crate::edge_runtime::EdgeRuntime;
use crate::utils::units::human_elapsed;
use anyhow::{anyhow, bail, Error};
use hyper::{Body, Request, Response};
use log::{debug, error};
use sb_worker_context::essentials::{
    CreateUserWorkerResult, EdgeContextInitOpts, EdgeContextOpts, UserWorkerMsgs,
};
use std::collections::HashMap;
use std::thread;
use tokio::net::{TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Debug)]
pub struct WorkerRequestMsg {
    pub req: Request<Body>,
    pub res_tx: oneshot::Sender<Result<Response<Body>, hyper::Error>>,
}

pub async fn create_worker(
    conf: EdgeContextInitOpts,    
) -> Result<(mpsc::UnboundedSender<WorkerRequestMsg>, oneshot::Sender<()>), Error> {
    let service_path = conf.service_path.clone();
    let service_path_clone = conf.service_path.clone();
    let service_path_clone2 = conf.service_path.clone();
    if !service_path.exists() {
        bail!("Main function does not exist {:?}", &service_path)
    }
   
    // channel for terminate worker-thread
    let (terminate_tx, terminate_rx) = oneshot::channel::<()>();
    // channel for send port
    let (port_tx, port_rx) = oneshot::channel::<u16>();    

    let is_user_runtime = match conf.conf.clone() {
        EdgeContextOpts::UserWorker(_) => true,
        EdgeContextOpts::MainWorker(_) => false,
    };

    if is_user_runtime {
        // user worker run on dedicated thread
        let res = thread::Builder::new()
        .name(service_path.into_os_string().into_string().unwrap())
        .spawn(move || {            
            
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            
            // spawn on LocalSet needed deno_core ===> spawn_local function
            let local = tokio::task::LocalSet::new();

            local.block_on(&runtime, async move {
                let mut worker = EdgeRuntime::new(conf).await.unwrap();
                
                _ = port_tx.send(worker.port);
                let life_time_ms = worker.curr_user_opts.life_time_ms;
                let key = worker.curr_user_opts.key;
                let pool_msg_tx = worker.curr_user_opts.pool_msg_tx.clone();               
                    
                // manages worker-thread shutdown (worker_ctx.rs ===> create_worker ===> terminate_rx)
                let handle = tokio::task::spawn_local(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(life_time_ms)).await;
                    debug!("Max duration reached for the Worker ({:?}). Terminating the worker (duration {}) ...",
                         key.unwrap_or(uuid::Uuid::default()),
                            human_elapsed(life_time_ms),
                        );
                     // send a shutdown message back to user worker pool (so it stops sending requets to the
                    // worker)
                    if let Some(k) = key {
                        if let Some(tx) = pool_msg_tx {
                            if tx.send(UserWorkerMsgs::Shutdown(k)).is_err() {
                                error!("Failed to send the halt execution signal");
                               }
                        }
                    };
                });
                
                // start the worker and wait completed event loop or termination thread
                tokio::select! {
                    _ = worker.run() => { 
                        debug!("Event loop of worker for service path: {:?} is completed", service_path_clone)
                    },
                    _ = terminate_rx => {
                        if !handle.is_finished() {
                            handle.abort();
                            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                        }
                        debug!("Worker for service path: {:?} is receive terminate signal", service_path_clone)
                    }
                };
            })
        });

        if res.is_err() {
            println!("User Worker panicked {:?}", res.err().unwrap());
        }
    } else {
        // main worker run on main thread of server
        tokio::task::spawn_local(async move{
            let mut worker = EdgeRuntime::new(conf).await.unwrap();
           
            _ = port_tx.send(worker.port);
            // main worker running always
            let res = worker.run().await;
            if res.is_err() {
                println!("Main Worker panicked {:?}", res.err().unwrap());
            }
        });
    }
    
    let (worker_req_tx, mut worker_req_rx) = mpsc::unbounded_channel::<WorkerRequestMsg>();

    tokio::task::spawn_local(async move {
        let port = port_rx.await.unwrap();        
        while let Some(msg) = worker_req_rx.recv().await {            
            let service_path_clone2 = service_path_clone2.clone();            
            // exclude blocking main worker and user worker during long-term processing of requests
            // user worker allways can receive new requests
            tokio::task::spawn_local(async move {
                let stream: TcpStream;                
                let result = TcpStream::connect(format!("127.0.0.1:{}", port)).await;                
                if result.is_ok() {
                    stream = result.unwrap();
                } else {
                    loop {
                        tokio::select! {
                            res = TcpStream::connect(format!("127.0.0.1:{}", port)) => {
                                match res {
                                    Ok(s) => {
                                        stream = s;
                                        break;
                                    },
                                    Err(_) => {
                                        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                                    },
                                }
                            }
                            _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {
                                stream = TcpStream::connect(format!("127.0.0.1:{}", port)).await.expect("Error tcp stream connect"); 
                                break;
                            }
                        }
                    }
                }                
                
                // send the HTTP request to the worker over tcp stream
                let (mut request_sender, connection) =
                    hyper::client::conn::handshake(stream).await.unwrap();

                // spawn a task to poll the connection and drive the HTTP state
                let handle = tokio::task::spawn_local(async move {
                    if let Err(e) = connection.without_shutdown().await {
                        error!("Error in main worker connection: {}, service path: {:?}", e, service_path_clone2.clone());
                    }
                });                
                
                tokio::time::sleep(std::time::Duration::from_millis(1)).await;
                
                let (mut parts, body) = msg.req.into_parts();                
                if let Some(_) = parts.uri.port_u16() {                   
                    let uri = format!("http://127.0.0.1:{}{}", port, parts.uri.path());
                    parts.uri = uri.parse().unwrap();
                }
                let request = http::Request::from_parts(parts, body);                
               
                let result = request_sender.send_request(request).await;                
                handle.abort();
                drop(request_sender);
                _ = msg.res_tx.send(result);
            });
        }
    });

    Ok((worker_req_tx, terminate_tx))
}

pub async fn create_user_worker_pool() -> Result<mpsc::UnboundedSender<UserWorkerMsgs>, Error> {
    let (user_worker_msgs_tx, mut user_worker_msgs_rx) =
        mpsc::unbounded_channel::<UserWorkerMsgs>();

    let user_worker_msgs_tx_clone = user_worker_msgs_tx.clone();

    tokio::task::spawn_local(async move {
        let mut user_workers: HashMap<
            Uuid,
            (mpsc::UnboundedSender<WorkerRequestMsg>, oneshot::Sender<()>),
        > = HashMap::new();
        let mut handles: HashMap<Uuid, Vec<JoinHandle<Result<(), anyhow::Error>>>> = HashMap::new();

        loop {
            match user_worker_msgs_rx.recv().await {
                None => break,
                Some(UserWorkerMsgs::Create(mut worker_options, tx)) => {
                    let key = Uuid::new_v4();
                    let mut user_worker_rt_opts = match worker_options.conf {
                        EdgeContextOpts::UserWorker(opts) => opts,
                        _ => unreachable!(),
                    };
                    user_worker_rt_opts.key = Some(key);
                    user_worker_rt_opts.pool_msg_tx = Some(user_worker_msgs_tx_clone.clone());
                    worker_options.conf = EdgeContextOpts::UserWorker(user_worker_rt_opts);                    
                    let result = create_worker(worker_options).await;

                    match result {
                        Ok((user_worker_req_tx, termination_tx)) => {
                            user_workers.insert(key, (user_worker_req_tx, termination_tx));

                            if tx.send(Ok(CreateUserWorkerResult { key })).is_err() {
                                bail!("Main worker receiver dropped")
                            };
                        }
                        Err(e) => {
                            if tx.send(Err(e)).is_err() {
                                bail!("Main worker receiver dropped")
                            };
                        }
                    }
                }
                Some(UserWorkerMsgs::SendRequest(key, req, tx)) => {
                    if let Some((worker, _)) = user_workers.get(&key) {
                        let worker_clone = worker.clone();

                        // remove loop blocking and collect handlers of one worker
                        let handle = tokio::task::spawn_local(async move {
                            let (res_tx, res_rx) =
                                oneshot::channel::<Result<Response<Body>, hyper::Error>>();
                            let msg = WorkerRequestMsg { req, res_tx };

                            // send the message to worker
                            worker_clone.send(msg)?;

                            // wait for the response back from the worker
                            let res = res_rx.await??;

                            // send the response back to the caller
                            if tx.send(Ok(res)).is_err() {
                                bail!("Main worker receiver dropped")
                            };

                            Ok(())
                        });

                        if let Some(handles_worker) = handles.get_mut(&key) {
                            handles_worker.push(handle);
                        } else {
                            handles.insert(key, vec![handle]);
                        }
                    } else if tx.send(Err(anyhow!("User worker not available"))).is_err() {
                        bail!("Main worker receiver dropped")
                    };
                }
                Some(UserWorkerMsgs::Shutdown(key)) => {
                    // take tx-half of channel worker, but not drop, otherwise panic in isolate
                    // so next use this worker impossible
                    let (worker, terminate_tx) = user_workers.remove(&key).unwrap();
                    let handles_worker = handles.remove(&key).unwrap_or(vec![]);

                    // remove loop blocking
                    tokio::task::spawn_local(async move {
                        // wait complete all requests
                        let _res = futures::future::join_all(handles_worker).await;

                        // terminate the Isolate only after all requests have been processed
                        // the thread_safe_handle.terminate_execution() method cannot be called because the event loop after the execution of the module body
                        // in the background can request network ops (op_net_accept_tcp) ===> panics in isolate ===> panics main thread ===> crash
                        
                        // terminate thread with Isolate
                        match terminate_tx.send(()) {
                            Ok(_) => {
                                debug!("Send terminated signal to Worker ({:?})", key)
                            }
                            Err(err) => {
                                bail!("Error Worker ({:?}) terminated: {:?}", key, err)
                            }
                        };
                        
                        // at first terminate worker-thread, second drop worker channel (otherwise panic because of close channel in isolate)
                        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                        tokio::task::yield_now().await;
                        
                        // drop worker only after terminate worker-thread
                        drop(worker);

                        Ok(())
                    });
                }
            }
        }

        Ok(())
    });

    Ok(user_worker_msgs_tx)
}
