use crate::server::Server;
use anyhow::Error;

pub async fn start_server(
    ip: &str,
    port: u16,
    main_service_path: String,
    import_map_path: Option<String>,
    no_module_cache: bool,
    num_main_workers: u16,
) -> Result<(), Error> {
    let mut server = Server::new(
        ip,
        port,
        main_service_path,
        import_map_path,
        no_module_cache,
        num_main_workers,
    )
    .await?;

    server.listen().await
}
