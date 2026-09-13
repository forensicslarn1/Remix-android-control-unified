//! Safe, explicit ADB operations used by the native desktop client.
use crate::models::DeviceInfo;
use std::{path::Path, process::Command};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AdbError {
    #[error("Could not launch adb: {0}")]
    Io(#[from] std::io::Error),
    #[error(
        "ADB returned no authorized devices. Enable USB debugging and accept the phone prompt."
    )]
    NoDevice,
    #[error(
        "More than one authorized device is connected. Disconnect the extra devices and try again."
    )]
    MultipleDevices,
}

#[derive(Clone, Debug)]
pub struct AdbOutput {
    pub command: String,
    pub output: String,
    pub success: bool,
}

pub fn run(adb: &Path, serial: Option<&str>, arguments: &[&str]) -> Result<AdbOutput, AdbError> {
    let mut command = Command::new(adb);
    if let Some(serial) = serial {
        command.arg("-s").arg(serial);
    }
    command.args(arguments);
    let output = command.output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let joined = if stderr.trim().is_empty() {
        stdout.trim().to_owned()
    } else {
        format!("{}\n{}", stdout.trim(), stderr.trim())
            .trim()
            .to_owned()
    };
    Ok(AdbOutput {
        command: format!("{} {}", adb.display(), arguments.join(" ")),
        output: joined,
        success: output.status.success(),
    })
}

pub fn find_device(adb: &Path) -> Result<String, AdbError> {
    let output = run(adb, None, &["devices"])?;
    let devices: Vec<String> = output
        .output
        .lines()
        .skip(1)
        .filter_map(|line| {
            let (serial, status) = line.split_once('\t')?;
            (status.trim() == "device").then(|| serial.trim().to_owned())
        })
        .collect();
    match devices.as_slice() {
        [serial] => Ok(serial.clone()),
        [] => Err(AdbError::NoDevice),
        _ => Err(AdbError::MultipleDevices),
    }
}

fn package_ids(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| line.strip_prefix("package:"))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect()
}

pub fn inspect(adb: &Path) -> Result<(DeviceInfo, Vec<String>, Vec<String>), AdbError> {
    let serial = find_device(adb)?;
    let get_prop =
        |key: &str| run(adb, Some(&serial), &["shell", "getprop", key]).map(|value| value.output);
    let info = DeviceInfo {
        serial: serial.clone(),
        manufacturer: get_prop("ro.product.manufacturer")?,
        model: get_prop("ro.product.model")?,
        android: get_prop("ro.build.version.release")?,
        sdk: get_prop("ro.build.version.sdk")?,
    };
    let all = run(
        adb,
        Some(&serial),
        &["shell", "pm", "list", "packages", "-u"],
    )?;
    let disabled = run(
        adb,
        Some(&serial),
        &["shell", "pm", "list", "packages", "-d"],
    )?;
    Ok((
        info,
        package_ids(&all.output),
        package_ids(&disabled.output),
    ))
}
