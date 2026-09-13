# Android Control Center — Native Desktop Companion

This is the **Rust native companion** for the Android Control Center browser dashboard. It uses a local `adb` executable rather than a hosted service. The design is intentionally transparent: package inventory, community metadata, actions, output, and restore attempts appear in a local command ledger.

## Safety and privacy

The normal package action is `pm disable-user --user 0 <package>`. The advanced option uses `pm uninstall -k --user 0 <package>` and is shown as less reversible. Both actions retain a local restore attempt using `cmd package install-existing --user 0 <package>` or `pm enable <package>`. A vendor may restrict, reinterpret, or reject these commands; classification from the community list is contextual guidance, not a guarantee.

The app does not collect telemetry and never uploads device serials, installed packages, command output, or receipts. The only network behavior implemented is a manual request to the published UAD-ng package-list URL. The update settings screen does not silently poll; a maintainer must configure their own GitHub Releases endpoint before a public release workflow is enabled.

## Windows release

The supported distribution targets are **Windows x64, macOS, and Linux**. The release package contains the Rust desktop executable plus the official Android Platform Tools files required for ADB (`adb.exe`, `AdbWinApi.dll`, and `AdbWinUsbApi.dll`). The application first looks for `resources\\adb\\adb.exe` beside the executable and falls back to `adb.exe` on `PATH` when running from source.

Install the Android USB driver appropriate for the phone, enable Developer options and USB debugging, connect the phone by USB, and accept the RSA authorization dialog. No device command runs before the user starts an inspection. The app remains local-first and does not upload serials, inventory, receipts, or command output.

To build on a Windows development machine, install the stable Rust MSVC toolchain and run from PowerShell:

```powershell
.\\scripts\\build-windows.ps1
```

The resulting executable is `desktop-companion\\target\\release\\android-control-center-desktop.exe` on Windows, or the corresponding native binary on macOS/Linux. The cross-platform GitHub Actions workflow packages all three platforms, while the Windows workflow also produces `android-control-center-windows-x64.zip`. The workflow downloads Platform Tools from Google at build time; the repository does not commit vendor binaries.

## Optional Authenticode signing

The workflow is prepared for trusted Authenticode signing but remains unsigned until a trusted Code Signing certificate is configured. After purchasing an OV or EV Code Signing certificate, export it as a password-protected `.pfx` file and configure these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `WINDOWS_CERTIFICATE_BASE64` | Base64-encoded contents of the `.pfx` file. |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password protecting the `.pfx` file. |

Never commit the `.pfx` file or its password. When both secrets exist, GitHub Actions uses the Windows SDK `signtool.exe` with SHA-256 and an RFC 3161 timestamp, then verifies the signature before packaging. When either secret is absent, the build intentionally produces an unsigned artifact.

## Source development

For a source-only run, install Android Platform Tools so `adb` is on the system `PATH`, then run `cargo run --release` inside `desktop-companion`. The native UI is built with `eframe`/`egui`, which provides the shared native GUI across Windows, macOS, and Linux.

## References

1. [Universal Android Debloater Next Generation](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation)
2. [Android Developer — Android Debug Bridge](https://developer.android.com/tools/adb)
3. [Android Enterprise — Work Profile](https://www.android.com/enterprise/work-profile/)
