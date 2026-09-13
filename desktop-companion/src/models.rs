//! Field Service Ledger: shared, local-only models for a transparent native client.

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct PackageDefinition {
    #[serde(default)]
    pub list: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, rename = "dependencies")]
    pub dependencies: Vec<String>,
    #[serde(default, rename = "neededBy")]
    pub needed_by: Vec<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub removal: String,
}

#[derive(Clone, Debug)]
pub struct DeviceInfo {
    pub serial: String,
    pub manufacturer: String,
    pub model: String,
    pub android: String,
    pub sdk: String,
}

#[derive(Clone, Debug)]
pub struct CommandReceipt {
    pub label: String,
    pub command: String,
    pub output: String,
    pub success: bool,
    pub restore: Option<String>,
}

impl CommandReceipt {
    pub fn browser(
        label: impl Into<String>,
        command: impl Into<String>,
        output: impl Into<String>,
        success: bool,
    ) -> Self {
        Self {
            label: label.into(),
            command: command.into(),
            output: output.into(),
            success,
            restore: None,
        }
    }
}
