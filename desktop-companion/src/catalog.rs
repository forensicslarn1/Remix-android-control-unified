//! Field Service Ledger: the community list is fetched only on explicit request and locally joined.

use std::collections::HashMap;
use thiserror::Error;

use crate::models::PackageDefinition;

pub const UAD_LIST_URL: &str = "https://raw.githubusercontent.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation/main/resources/assets/uad_lists.json";

#[derive(Debug, Error)]
pub enum CatalogError {
    #[error("Network request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Package list was not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn fetch() -> Result<HashMap<String, PackageDefinition>, CatalogError> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Android-Control-Center-Desktop/0.1")
        .build()?;
    let body = client
        .get(UAD_LIST_URL)
        .send()?
        .error_for_status()?
        .text()?;
    Ok(serde_json::from_str(&body)?)
}
