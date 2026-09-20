// @ts-check
const { app, BrowserWindow, session, shell, Menu } = require("electron");
const path = require("path");

// Enable experimental web platform features & WebUSB passthrough switches
app.commandLine.appendSwitch("enable-experimental-web-platform-features");
app.commandLine.appendSwitch("enable-webusb-on-any-origin");
app.commandLine.appendSwitch("disable-site-isolation-trials");

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: "Android Control Center & Debloat Suite",
    backgroundColor: "#0f172a", // Dark background theme
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      experimentalFeatures: true,
    },
  });

  // Configure WebUSB and Hardware Passthrough Permissions
  const ses = mainWindow.webContents.session;

  // 1. Grant permission requests for WebUSB, Serial, and HID devices
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === "usb" || permission === "serial" || permission === "hid") {
      return callback(true);
    }
    // Allow standard web features
    callback(true);
  });

  // 2. Grant permission check handler for WebUSB
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === "usb" || permission === "serial" || permission === "hid") {
      return true;
    }
    return true;
  });

  // 3. Grant device permission handler
  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType === "usb" || details.deviceType === "serial" || details.deviceType === "hid") {
      return true;
    }
    return true;
  });

  // 4. Handle WebUSB device picker selection ('select-usb-device')
  // When navigator.usb.requestDevice() is called, Electron intercepts it here.
  mainWindow.webContents.session.on("select-usb-device", (event, details, callback) => {
    event.preventDefault();

    if (details.deviceList && details.deviceList.length > 0) {
      // Auto-select the first matching USB device (e.g. Android ADB device)
      const selected = details.deviceList[0];
      console.log("[Electron WebUSB] Selected USB Device:", selected.deviceName || selected.deviceId);
      callback(selected.deviceId);
    } else {
      console.log("[Electron WebUSB] Waiting for USB device connection...");
      // Listen for USB device attachment if none was detected immediately
      const onDeviceAdded = (e, device) => {
        console.log("[Electron WebUSB] USB Device Connected:", device.deviceName || device.deviceId);
        mainWindow?.webContents.session.removeListener("usb-device-added", onDeviceAdded);
        callback(device.deviceId);
      };
      mainWindow?.webContents.session.once("usb-device-added", onDeviceAdded);
    }
  });

  // Open external links in the default desktop browser instead of Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Determine whether running in dev mode or production
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const isDev = Boolean(devServerUrl) || !app.isPackaged;

  if (devServerUrl) {
    console.log("[Electron] Loading dev server:", devServerUrl);
    mainWindow.loadURL(devServerUrl);
  } else if (isDev && process.env.NODE_ENV !== "production") {
    const localDevUrl = "http://localhost:3000";
    console.log("[Electron] Loading local URL:", localDevUrl);
    mainWindow.loadURL(localDevUrl).catch(() => {
      // If dev server isn't ready or running, fallback to dist
      const indexPath = path.join(__dirname, "../dist/index.html");
      console.log("[Electron] Falling back to built index:", indexPath);
      mainWindow?.loadFile(indexPath);
    });
  } else {
    const indexPath = path.join(__dirname, "../dist/index.html");
    console.log("[Electron] Loading production bundle:", indexPath);
    mainWindow.loadFile(indexPath);
  }

  // Gracefully reveal window when ready to avoid visual flicker
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
