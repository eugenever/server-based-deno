pub mod http_start;
pub mod net;
pub mod permissions;
pub mod runtime;

use deno_core::error::AnyError;
use deno_core::op;

deno_core::extension!(
    sb_core_main_js,
    ops = [
        op_set_timeout2,
        op_remove_file2,
        op_read_file_tokio,
        op_fetch_reqwest,
        op_write_file_tokio
    ],
    esm = [
        "js/permissions.js",
        "js/errors.js",
        "js/fieldUtils.js",
        "js/promises.js",
        "js/http.js",
        "js/denoOverrides.js",
        "js/user_runtime_loader.js",
        "js/bootstrap.js",
        "js/main_worker.js",
    ]
);

#[op]
pub async fn op_read_file_tokio(path: String) -> Result<String, AnyError> {
    let contents = tokio::fs::read_to_string(path).await?;
    Ok(contents)
}

#[op]
pub async fn op_write_file_tokio(path: String, contents: String) -> Result<(), AnyError> {
    tokio::fs::write(path, contents).await?;
    Ok(())
}

#[op]
pub async fn op_fetch_reqwest(url: String) -> Result<String, AnyError> {
    let body = reqwest::get(url).await?.text().await?;
    Ok(body)
}

#[op]
pub async fn op_set_timeout2(delay: u64) -> Result<(), AnyError> {
    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
    Ok(())
}

#[op]
pub fn op_remove_file2(path: String) -> Result<(), AnyError> {
    std::fs::remove_file(path)?;
    Ok(())
}
