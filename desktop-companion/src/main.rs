//! Android Control Center: beginner-friendly, local-first Android package manager.
#![cfg_attr(windows, windows_subsystem = "windows")]

mod adb;
mod catalog;
mod models;

use eframe::egui::{self, Color32, RichText, Stroke};
use models::{CommandReceipt, DeviceInfo, PackageDefinition};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::PathBuf,
};

const INK: Color32 = Color32::from_rgb(20, 37, 58);
const PAPER: Color32 = Color32::from_rgb(246, 242, 234);
const LIME: Color32 = Color32::from_rgb(200, 240, 74);
const MUTED: Color32 = Color32::from_rgb(104, 117, 132);
const RED: Color32 = Color32::from_rgb(160, 64, 52);
const UAD_REPO: &str =
    "https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation";
const RELEASES_URL: &str =
    "https://api.github.com/repos/forensicslarn1/android-control-unified/releases/latest";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    Device,
    Packages,
    Privacy,
    Settings,
}

struct App {
    page: Page,
    adb_path: PathBuf,
    adb_path_input: String,
    device: Option<DeviceInfo>,
    packages: Vec<String>,
    disabled: HashSet<String>,
    catalog: HashMap<String, PackageDefinition>,
    selected: HashSet<String>,
    focused: Option<String>,
    search: String,
    category: String,
    risk: String,
    show_disabled: bool,
    advanced_mode: bool,
    confirm_risk: bool,
    receipts: Vec<CommandReceipt>,
    status: String,
    update_status: String,
}

fn default_adb_path() -> PathBuf {
    let name = if cfg!(windows) { "adb.exe" } else { "adb" };
    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("resources").join("adb").join(name));
            candidates.push(parent.join("adb").join(name));
        }
    }
    candidates.push(PathBuf::from(name));
    candidates
        .into_iter()
        .find(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from(name))
}

impl Default for App {
    fn default() -> Self {
        let adb = default_adb_path();
        Self { page: Page::Device, adb_path: adb.clone(), adb_path_input: adb.display().to_string(), device: None, packages: vec![], disabled: HashSet::new(), catalog: HashMap::new(), selected: HashSet::new(), focused: None, search: String::new(), category: "All".into(), risk: "All".into(), show_disabled: true, advanced_mode: false, confirm_risk: false, receipts: vec![CommandReceipt::browser("Ready", "No device command issued", "Connect a phone, enable USB debugging, accept the RSA prompt, then press Inspect device.", true)], status: "No authorized device in this session.".into(), update_status: String::new() }
    }
}

impl App {
    fn receipt(
        &mut self,
        label: impl Into<String>,
        result: Result<adb::AdbOutput, adb::AdbError>,
        restore: Option<String>,
    ) {
        match result {
            Ok(r) => self.receipts.insert(
                0,
                CommandReceipt {
                    label: label.into(),
                    command: r.command,
                    output: r.output,
                    success: r.success,
                    restore,
                },
            ),
            Err(e) => self.receipts.insert(
                0,
                CommandReceipt::browser(label, "local adb invocation", e.to_string(), false),
            ),
        }
        self.receipts.truncate(80);
    }

    fn inspect(&mut self) {
        self.adb_path = PathBuf::from(self.adb_path_input.trim());
        self.status = "Reading device identity and package inventory locally…".into();
        match adb::inspect(&self.adb_path) {
            Ok((device, packages, disabled)) => {
                self.device = Some(device.clone());
                self.packages = packages;
                self.disabled = disabled.into_iter().collect();
                self.selected.clear();
                self.status = format!(
                    "Authorized: {} {} · {} packages found · {} disabled",
                    device.manufacturer,
                    device.model,
                    self.packages.len(),
                    self.disabled.len()
                );
                self.receipts.insert(
                    0,
                    CommandReceipt::browser(
                        "Device inspected",
                        format!(
                            "{} devices + getprop + pm list packages",
                            self.adb_path.display()
                        ),
                        "Inventory and device properties remain in this application session.",
                        true,
                    ),
                );
            }
            Err(e) => {
                self.device = None;
                self.status = e.to_string();
                self.receipts.insert(
                    0,
                    CommandReceipt::browser(
                        "Inspection failed",
                        format!("{} devices", self.adb_path.display()),
                        e.to_string(),
                        false,
                    ),
                );
            }
        }
    }

    fn refresh_catalog(&mut self) {
        self.status = "Downloading the community package list from GitHub…".into();
        match catalog::fetch() {
            Ok(list) => {
                let n = list.len();
                self.catalog = list;
                self.status = format!("Loaded {n} community definitions. No device data was sent.");
                self.receipts.insert(
                    0,
                    CommandReceipt::browser(
                        "Community list refreshed",
                        format!("GET {}", catalog::UAD_LIST_URL),
                        format!("{n} definitions loaded locally."),
                        true,
                    ),
                );
            }
            Err(e) => {
                self.status = e.to_string();
                self.receipts.insert(
                    0,
                    CommandReceipt::browser(
                        "Community list failed",
                        format!("GET {}", catalog::UAD_LIST_URL),
                        e.to_string(),
                        false,
                    ),
                );
            }
        }
    }

    fn update_check(&mut self) {
        self.update_status = "Checking GitHub releases…".into();
        let result: Result<String, String> = (|| {
            let client = reqwest::blocking::Client::builder()
                .user_agent("Android-Control-Center-Desktop")
                .build()
                .map_err(|e| e.to_string())?;
            let value: serde_json::Value = client
                .get(RELEASES_URL)
                .send()
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .map_err(|e| e.to_string())?;
            Ok(value
                .get("tag_name")
                .and_then(|v| v.as_str())
                .unwrap_or("No published release")
                .to_owned())
        })();
        match result {
            Ok(tag) => {
                self.update_status = format!("Latest GitHub release: {tag}");
                self.receipts.insert(
                    0,
                    CommandReceipt::browser(
                        "Update check completed",
                        format!("GET {RELEASES_URL}"),
                        self.update_status.clone(),
                        true,
                    ),
                );
            }
            Err(e) => {
                self.update_status = format!("Update check failed: {e}");
                self.receipts.insert(
                    0,
                    CommandReceipt::browser(
                        "Update check failed",
                        format!("GET {RELEASES_URL}"),
                        e,
                        false,
                    ),
                );
            }
        }
    }

    fn act_on(&mut self, id: &str, action: &str) {
        let Some(device) = self.device.as_ref() else {
            self.status = "Inspect an authorized device first.".into();
            return;
        };
        let serial = device.serial.clone();
        let args: Vec<String> = match action {
            "disable" => vec![
                "shell".into(),
                "pm".into(),
                "disable-user".into(),
                "--user".into(),
                "0".into(),
                id.into(),
            ],
            "uninstall" => vec![
                "shell".into(),
                "pm".into(),
                "uninstall".into(),
                "-k".into(),
                "--user".into(),
                "0".into(),
                id.into(),
            ],
            "restore" => vec![
                "shell".into(),
                "cmd".into(),
                "package".into(),
                "install-existing".into(),
                "--user".into(),
                "0".into(),
                id.into(),
            ],
            _ => return,
        };
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let restore = if action == "disable" || action == "uninstall" {
            Some(format!(
                "adb -s {serial} shell cmd package install-existing --user 0 {id}"
            ))
        } else {
            None
        };
        self.receipt(
            format!("{} {id}", action),
            adb::run(&self.adb_path, Some(&serial), &refs),
            restore,
        );
        if action == "disable" {
            self.disabled.insert(id.to_owned());
        }
        if action == "restore" {
            self.disabled.remove(id);
        }
        self.status = format!("Action recorded for {id}. Read the command ledger for the result.");
    }

    fn apply_selected(&mut self) {
        if !self.confirm_risk {
            self.status = "Tick the risk acknowledgement before changing packages.".into();
            return;
        }
        let ids: Vec<String> = self.selected.iter().cloned().collect();
        for id in ids {
            let action = if self.advanced_mode {
                "uninstall"
            } else {
                "disable"
            };
            self.act_on(&id, action);
        }
        self.selected.clear();
    }

    fn export_receipts(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .set_file_name("android-control-receipts.json")
            .add_filter("JSON", &["json"])
            .save_file()
        else {
            return;
        };
        let value: Vec<_> = self.receipts.iter().map(|r| serde_json::json!({"label":r.label,"command":r.command,"output":r.output,"success":r.success,"restore":r.restore})).collect();
        match serde_json::to_string_pretty(&value)
            .ok()
            .and_then(|s| fs::write(&path, s).ok())
        {
            Some(_) => self.status = format!("Exported local receipts to {}", path.display()),
            None => self.status = "Could not write the receipt export.".into(),
        }
    }

    fn visible_packages(&self) -> Vec<String> {
        let q = self.search.to_lowercase();
        let mut rows: Vec<String> = self
            .packages
            .iter()
            .filter(|id| self.show_disabled || !self.disabled.contains(*id))
            .filter(|id| {
                q.is_empty()
                    || id.to_lowercase().contains(&q)
                    || self
                        .catalog
                        .get(*id)
                        .map(|d| {
                            format!("{} {}", d.description, d.list)
                                .to_lowercase()
                                .contains(&q)
                        })
                        .unwrap_or(false)
            })
            .filter(|id| {
                let d = self.catalog.get(*id);
                let cat_ok =
                    self.category == "All" || d.map(|x| x.list == self.category).unwrap_or(false);
                let risk_ok =
                    self.risk == "All" || d.map(|x| x.removal == self.risk).unwrap_or(false);
                cat_ok && risk_ok
            })
            .cloned()
            .collect();
        rows.sort();
        rows
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let mut visuals = egui::Visuals::light();
        visuals.panel_fill = PAPER;
        visuals.window_fill = PAPER;
        visuals.selection.bg_fill = LIME;
        ctx.set_visuals(visuals);
        egui::TopBottomPanel::top("top")
            .frame(
                egui::Frame::none()
                    .fill(INK)
                    .inner_margin(egui::Margin::symmetric(18.0, 14.0)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("ANDROID CONTROL CENTER")
                            .strong()
                            .color(PAPER)
                            .size(17.0),
                    );
                    ui.separator();
                    ui.label(
                        RichText::new(if self.device.is_some() {
                            "AUTHORIZED DEVICE"
                        } else {
                            "NO DEVICE"
                        })
                        .monospace()
                        .color(if self.device.is_some() {
                            LIME
                        } else {
                            Color32::LIGHT_GRAY
                        }),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(
                            RichText::new("LOCAL ONLY · NO TELEMETRY")
                                .monospace()
                                .color(Color32::LIGHT_GRAY)
                                .size(10.0),
                        );
                    });
                });
            });
        egui::SidePanel::left("nav")
            .exact_width(190.0)
            .frame(
                egui::Frame::none()
                    .fill(INK)
                    .inner_margin(egui::Margin::same(12.0)),
            )
            .show(ctx, |ui| {
                ui.add_space(8.0);
                for (p, text) in [
                    (Page::Device, "Device"),
                    (Page::Packages, "Packages"),
                    (Page::Privacy, "Privacy & De-Google"),
                    (Page::Settings, "Settings & Updates"),
                ] {
                    if ui
                        .selectable_label(
                            self.page == p,
                            RichText::new(text).color(if self.page == p { INK } else { PAPER }),
                        )
                        .clicked()
                    {
                        self.page = p;
                    }
                    ui.add_space(4.0);
                }
                ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
                    ui.label(
                        RichText::new("Use at your own risk.\nEvery action is recorded locally.")
                            .size(11.0)
                            .color(Color32::from_rgb(180, 195, 208)),
                    );
                });
            });
        egui::SidePanel::right("ledger")
            .exact_width(330.0)
            .frame(
                egui::Frame::none()
                    .fill(INK)
                    .inner_margin(egui::Margin::same(12.0)),
            )
            .show(ctx, |ui| {
                ui.label(RichText::new("COMMAND LEDGER").monospace().color(LIME));
                ui.label(
                    RichText::new("Nothing happens off record.")
                        .strong()
                        .color(PAPER),
                );
                ui.separator();
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for r in &self.receipts {
                        egui::Frame::none()
                            .fill(Color32::from_rgb(28, 50, 75))
                            .stroke(Stroke::new(1.0_f32, Color32::from_rgb(58, 83, 106)))
                            .inner_margin(egui::Margin::same(9.0))
                            .show(ui, |ui| {
                                ui.label(RichText::new(&r.label).strong().color(PAPER));
                                ui.label(
                                    RichText::new(&r.command)
                                        .monospace()
                                        .size(10.0)
                                        .color(Color32::LIGHT_GRAY),
                                );
                                if !r.output.is_empty() {
                                    ui.label(
                                        RichText::new(&r.output).monospace().size(10.0).color(
                                            if r.success {
                                                Color32::LIGHT_GRAY
                                            } else {
                                                Color32::from_rgb(255, 170, 150)
                                            },
                                        ),
                                    );
                                }
                                if let Some(s) = &r.restore {
                                    ui.label(
                                        RichText::new(format!("restore → {s}"))
                                            .monospace()
                                            .size(9.0)
                                            .color(LIME),
                                    );
                                }
                            });
                        ui.add_space(6.0);
                    }
                });
                ui.separator();
                if ui.button("Export local receipts").clicked() {
                    self.export_receipts();
                }
            });
        egui::CentralPanel::default()
            .frame(
                egui::Frame::none()
                    .fill(PAPER)
                    .inner_margin(egui::Margin::symmetric(22.0, 18.0)),
            )
            .show(ctx, |ui| {
                match self.page {
                    Page::Device => self.device_page(ui),
                    Page::Packages => self.packages_page(ui),
                    Page::Privacy => self.privacy_page(ui),
                    Page::Settings => self.settings_page(ui),
                }
                ui.separator();
                ui.label(RichText::new(&self.status).color(MUTED).size(11.0));
            });
    }
}

fn card(ui: &mut egui::Ui, f: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::none()
        .fill(Color32::from_rgb(255, 253, 248))
        .stroke(Stroke::new(1.0_f32, Color32::from_rgb(216, 209, 196)))
        .inner_margin(egui::Margin::same(14.0))
        .show(ui, f);
}

impl App {
    fn device_page(&mut self, ui: &mut egui::Ui) {
        ui.heading(
            RichText::new("Connect a phone, inspect first.")
                .color(INK)
                .size(28.0),
        );
        ui.label(RichText::new("This app uses local ADB. It does not need an account or a server. Enable Developer options → USB debugging, connect the phone, unlock it, accept the RSA prompt, then inspect.").color(MUTED));
        ui.add_space(14.0);
        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label("ADB executable");
                ui.add(egui::TextEdit::singleline(&mut self.adb_path_input).desired_width(360.0));
                if ui.button("Inspect device").clicked() {
                    self.inspect();
                }
            });
        });
        if let Some(d) = &self.device {
            ui.add_space(12.0);
            card(ui, |ui| {
                ui.columns(4, |c| {
                    c[0].label(RichText::new("DEVICE").monospace().color(MUTED));
                    c[0].label(format!("{} {}", d.manufacturer, d.model));
                    c[1].label(RichText::new("ANDROID").monospace().color(MUTED));
                    c[1].label(format!("{} / API {}", d.android, d.sdk));
                    c[2].label(RichText::new("PACKAGES").monospace().color(MUTED));
                    c[2].label(self.packages.len().to_string());
                    c[3].label(RichText::new("DISABLED").monospace().color(MUTED));
                    c[3].label(self.disabled.len().to_string());
                });
            });
        } else {
            ui.add_space(18.0);
            ui.label(RichText::new("No authorized device loaded.").color(MUTED));
        }
    }

    fn packages_page(&mut self, ui: &mut egui::Ui) {
        ui.heading(
            RichText::new("Packages and De-Google review")
                .color(INK)
                .size(27.0),
        );
        ui.label(RichText::new("The community list is guidance, not a guarantee. Unknown packages are never recommended automatically. Review the exact package, dependencies, and warning before acting.").color(MUTED));
        ui.horizontal_wrapped(|ui| {
            ui.label("Search");
            ui.add(egui::TextEdit::singleline(&mut self.search).desired_width(220.0));
            ui.label("Category");
            egui::ComboBox::from_id_source("category")
                .selected_text(&self.category)
                .show_ui(ui, |ui| {
                    for x in ["All", "Google", "Oem", "Aosp", "Carrier", "Misc"] {
                        ui.selectable_value(&mut self.category, x.to_owned(), x);
                    }
                });
            ui.label("Safety");
            egui::ComboBox::from_id_source("risk")
                .selected_text(&self.risk)
                .show_ui(ui, |ui| {
                    for x in ["All", "Recommended", "Advanced", "Unsafe"] {
                        ui.selectable_value(&mut self.risk, x.to_owned(), x);
                    }
                });
            ui.checkbox(&mut self.show_disabled, "Show disabled");
        });
        ui.horizontal(|ui| {
            if ui.button("Refresh community list").clicked() {
                self.refresh_catalog();
            }
            if ui.button("Select visible").clicked() {
                self.selected.extend(self.visible_packages());
            }
            if ui.button("Clear selection").clicked() {
                self.selected.clear();
            }
            ui.checkbox(
                &mut self.confirm_risk,
                "I accept the risk for selected actions",
            );
            if ui
                .add_enabled(
                    !self.selected.is_empty() && self.confirm_risk && self.device.is_some(),
                    egui::Button::new("Disable selected safely"),
                )
                .clicked()
            {
                self.advanced_mode = false;
                self.apply_selected();
            }
        });
        ui.add_space(8.0);
        if self.catalog.is_empty() {
            ui.label(RichText::new("Refresh the community list to see safety context. The installed package inventory can still be viewed below.").color(MUTED));
        }
        ui.columns(2, |cols| {
            egui::ScrollArea::vertical()
                .max_height(540.0)
                .show(&mut cols[0], |ui| {
                    let rows = self.visible_packages();
                    ui.label(format!(
                        "{} visible packages · {} selected",
                        rows.len(),
                        self.selected.len()
                    ));
                    for id in rows {
                        let def = self.catalog.get(&id);
                        let label = def
                            .map(|d| format!("{} · {}", d.removal, d.list))
                            .unwrap_or_else(|| "Unknown · not in community list".into());
                        let mut checked = self.selected.contains(&id);
                        ui.horizontal(|ui| {
                            if ui.checkbox(&mut checked, "").changed() {
                                if checked {
                                    self.selected.insert(id.clone());
                                } else {
                                    self.selected.remove(&id);
                                }
                            }
                            if ui
                                .selectable_label(
                                    self.focused.as_ref() == Some(&id),
                                    RichText::new(&id).monospace().size(11.0),
                                )
                                .clicked()
                            {
                                self.focused = Some(id.clone());
                            }
                        });
                        ui.label(RichText::new(label).size(10.0).color(
                            if def.map(|d| d.removal == "Unsafe").unwrap_or(false) {
                                RED
                            } else {
                                MUTED
                            },
                        ));
                        ui.separator();
                    }
                });
            self.package_details(&mut cols[1]);
        });
    }

    fn package_details(&mut self, ui: &mut egui::Ui) {
        let Some(id) = self.focused.clone() else {
            ui.label(RichText::new("Select a package to view details.").color(MUTED));
            return;
        };
        let (classification, category, description, dependencies, needed_by) = self.catalog.get(&id).map(|d| (d.removal.clone(), d.list.clone(), d.description.clone(), d.dependencies.clone(), d.needed_by.clone())).unwrap_or_else(|| ("Unknown".into(), "Unknown".into(), "No community classification. Do not remove unless you understand this package.".into(), vec![], vec![]));
        let known_safe = classification != "Unknown" && classification != "Unsafe";
        let recommended = classification == "Recommended";
        let is_disabled = self.disabled.contains(&id);
        ui.heading(RichText::new("Package details").color(INK).size(20.0));
        ui.label(RichText::new(&id).monospace().strong());
        if is_disabled {
            ui.colored_label(
                Color32::from_rgb(110, 130, 45),
                "Currently disabled for User 0",
            );
        }
        ui.label(format!(
            "Category: {} · Safety: {}",
            category, classification
        ));
        ui.add_space(6.0);
        ui.label(RichText::new(description).color(MUTED));
        if !dependencies.is_empty() {
            ui.label(format!("Dependencies: {}", dependencies.join(", ")));
        }
        if !needed_by.is_empty() {
            ui.label(format!("Needed by: {}", needed_by.join(", ")));
        }
        ui.add_space(12.0);
        ui.checkbox(
            &mut self.confirm_risk,
            "I understand this may break features and I accept the risk.",
        );
        ui.checkbox(
            &mut self.advanced_mode,
            "Advanced: uninstall for User 0 (less reversible)",
        );
        let enabled = self.device.is_some() && self.confirm_risk;
        ui.horizontal(|ui| {
            if ui
                .add_enabled(enabled && known_safe, egui::Button::new("Disable package"))
                .clicked()
            {
                self.act_on(&id, "disable");
            }
            if ui
                .add_enabled(
                    enabled && self.advanced_mode && recommended,
                    egui::Button::new("Uninstall for User 0"),
                )
                .clicked()
            {
                self.act_on(&id, "uninstall");
            }
            if ui
                .add_enabled(
                    self.device.is_some(),
                    egui::Button::new("Restore / install-existing"),
                )
                .clicked()
            {
                self.act_on(&id, "restore");
            }
        });
    }

    fn privacy_page(&mut self, ui: &mut egui::Ui) {
        ui.heading(RichText::new("Privacy and De-Google").color(INK).size(27.0));
        ui.label(RichText::new("Removing Google components is not one universal switch. Play Services, Play Store, WebView, the Google account stack, and OEM dependencies can be essential on some phones. The app therefore shows package-specific community guidance and never silently removes a whole vendor stack.").color(MUTED));
        ui.add_space(12.0);
        for (title, cmd, desc) in [
            (
                "Read Android users and work profiles",
                "pm list users",
                "Inspection only; profiles are a management boundary.",
            ),
            (
                "Read private DNS mode",
                "settings get global private_dns_mode",
                "Inspection only; no setting is changed.",
            ),
            (
                "Read device policy state",
                "dumpsys device_policy",
                "Inspection only; output can be device-specific.",
            ),
        ] {
            card(ui, |ui| {
                ui.label(RichText::new(title).strong());
                ui.label(RichText::new(desc).color(MUTED).size(11.0));
                ui.monospace(format!("adb shell {cmd}"));
                if ui
                    .add_enabled(
                        self.device.is_some(),
                        egui::Button::new("Run read-only check"),
                    )
                    .clicked()
                {
                    if let Some(d) = &self.device {
                        let args: Vec<&str> = std::iter::once("shell")
                            .chain(cmd.split_whitespace())
                            .collect();
                        self.receipt(
                            title,
                            adb::run(&self.adb_path, Some(&d.serial), &args),
                            None,
                        );
                    }
                }
            });
            ui.add_space(7.0);
        }
    }

    fn settings_page(&mut self, ui: &mut egui::Ui) {
        ui.heading(RichText::new("Settings and updates").color(INK).size(27.0));
        ui.label(RichText::new("The only external traffic is an explicit GET request to GitHub for the community list or release metadata. No analytics, accounts, device identifiers, or inventories are sent.").color(MUTED));
        ui.add_space(12.0);
        card(ui, |ui| {
            ui.label(RichText::new("Application updates").strong());
            ui.label(RELEASES_URL);
            if ui.button("Check for updates").clicked() {
                self.update_check();
            }
            if !self.update_status.is_empty() {
                ui.label(&self.update_status);
            }
        });
        ui.add_space(8.0);
        card(ui, |ui| {
            ui.label(RichText::new("Safety boundary").strong());
            ui.colored_label(RED, "Use at your own risk. Disablement and User 0 uninstall can break Android or OEM features. Root is not required, but Android and the device vendor still enforce permissions.");
            ui.label(
                "The app records every local command, output, and restore attempt in the ledger.",
            );
        });
        ui.hyperlink_to("Community list source", catalog::UAD_LIST_URL);
        ui.hyperlink_to("UAD-ng project and usage guidance", UAD_REPO);
    }
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1440.0, 900.0])
            .with_min_inner_size([1120.0, 700.0]),
        ..Default::default()
    };
    eframe::run_native(
        "Android Control Center",
        options,
        Box::new(|_| Box::<App>::default()),
    )
}
