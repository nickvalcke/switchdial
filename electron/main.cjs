const {
  Menu,
  Tray,
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFile, execFileSync } = require("node:child_process");

const DEV_URL = "http://localhost:5173";
const HOTKEY = "Cmd+Shift+J";
const WHEEL_PX = 360;

let win = null;
let settingsWin = null;
let tray = null;

// --- Config: which 6 apps live in the wheel ---
// First-run default is 6 empty slots; the user populates them via Settings,
// which we auto-open the very first time the app launches.
const EMPTY_SEGMENTS = Array.from({ length: 6 }, () => ({ app: null }));

function configPath() {
  return path.join(app.getPath("userData"), "wheel-config.json");
}

function configExists() {
  return fs.existsSync(configPath());
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.segments) && parsed.segments.length === 6) {
      return parsed;
    }
  } catch {
    /* missing or corrupt → use defaults */
  }
  return { segments: EMPTY_SEGMENTS };
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

function broadcastConfig() {
  const config = readConfig();
  for (const w of [win, settingsWin].filter(Boolean)) {
    w.webContents.send("wheel:config-changed", config);
  }
}

// --- Installed apps (for the settings picker) ---
function listInstalledApps() {
  const dirs = ["/Applications", path.join(os.homedir(), "Applications")];
  const seen = new Set();
  const apps = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".app")) continue;
      const name = entry.slice(0, -4);
      if (seen.has(name)) continue;
      seen.add(name);
      apps.push({ name });
    }
  }
  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

// Lazy: requiring uiohook-napi at top level can interfere with Electron's
// app.whenReady on macOS.
let uIOhook = null;
let UiohookKey = null;

let optionDown = false;
// `overlayShown` is true while Option is held and we've put the invisible
// click-catching window over the screen. `wheelOpen` is true once the user
// has clicked and the wheel circles are actually drawn.
let overlayShown = false;
let wheelOpen = false;
// "gesture" = opened by Option+drag (mouseup commits); "menu" = opened by
// hotkey or tray (the next deliberate mousedown commits, opening mouseup is
// ignored to avoid a flash).
let openMode = null;
// Origin of the current gesture in screen coords; cursor deltas are relative
// to this point.
let gestureOrigin = null;

function createWindow() {
  win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // Must be resizable so setBounds() can grow it to the full work area
    // when the wheel opens (frame: false means the user can't drag-resize).
    resizable: true,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    type: "panel",
    // Created at wheel size; resized to the full work area on each show so
    // the transparent overlay blocks the underlying app from receiving any
    // mouse events during the gesture.
    width: WHEEL_PX,
    height: WHEEL_PX,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver", 1);
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });

  if (!app.isPackaged) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function rectsEqual(a, b) {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

// Step 1: invisible click-blocking overlay covering the cursor's display.
// Shown on Option-down so any subsequent click hits us, not the underlying app.
function showOverlay(screenPoint) {
  if (!win) return;
  const display = screen.getDisplayNearestPoint(screenPoint);
  // (Re-)anchor to the correct display, even if already shown — handles the
  // case where Option was pressed on display A and the click lands on B.
  if (!overlayShown || !rectsEqual(win.getBounds(), display.workArea)) {
    win.setBounds(display.workArea);
  }
  win.setAlwaysOnTop(true, "screen-saver", 1);
  win.showInactive();
  overlayShown = true;
  win.webContents.send("wheel:overlay-shown");
}

// Step 2: actually draw the wheel inside the overlay at the click point.
function showWheelAt(screenPoint, mode = "gesture") {
  if (!win) return;
  // Always re-call showOverlay so a multi-display flow re-anchors to the
  // correct screen before we compute display-local coords.
  showOverlay(screenPoint);
  const display = screen.getDisplayNearestPoint(screenPoint);
  wheelOpen = true;
  openMode = mode;
  gestureOrigin = { ...screenPoint };
  win.webContents.send("wheel:opened", {
    x: screenPoint.x - display.workArea.x,
    y: screenPoint.y - display.workArea.y,
  });
}

function hideWheel() {
  overlayShown = false;
  wheelOpen = false;
  openMode = null;
  gestureOrigin = null;
  if (win && win.isVisible()) win.hide();
}

ipcMain.on("wheel:hide", () => hideWheel());
ipcMain.on("wheel:launch", (_e, appName) => {
  hideWheel();
  if (!appName) return; // empty slot, nothing to launch
  execFile("open", ["-a", appName], (err) => {
    if (err) console.error("[wheel] launch failed:", appName, err.message);
  });
});

// Extract a Mac app's icon as a PNG data URL via the built-in `defaults`
// (to find the CFBundleIconFile) and `sips` (to convert .icns → .png).
// Avoids Electron's app.getFileIcon, which crashes Electron 42 with SIGTRAP.
function readAppIcon(appName) {
  const dirs = ["/Applications", path.join(os.homedir(), "Applications")];
  let appPath = null;
  for (const dir of dirs) {
    const candidate = path.join(dir, `${appName}.app`);
    if (fs.existsSync(candidate)) {
      appPath = candidate;
      break;
    }
  }
  if (!appPath) return null;

  let iconName = null;
  try {
    iconName = execFileSync(
      "defaults",
      ["read", `${appPath}/Contents/Info`, "CFBundleIconFile"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    /* fall through to filesystem scan */
  }

  const resourcesDir = `${appPath}/Contents/Resources`;
  let icnsPath = null;
  if (iconName) {
    for (const candidate of [iconName, `${iconName}.icns`]) {
      const p = path.join(resourcesDir, candidate);
      if (fs.existsSync(p)) {
        icnsPath = p;
        break;
      }
    }
  }
  if (!icnsPath && fs.existsSync(resourcesDir)) {
    const icnses = fs
      .readdirSync(resourcesDir)
      .filter((f) => f.toLowerCase().endsWith(".icns"));
    if (icnses.length) icnsPath = path.join(resourcesDir, icnses[0]);
  }
  if (!icnsPath) return null;

  const tmpPng = path.join(
    os.tmpdir(),
    `wheel-icon-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );
  try {
    execFileSync(
      "sips",
      ["-s", "format", "png", "-Z", "128", icnsPath, "--out", tmpPng],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    const buf = fs.readFileSync(tmpPng);
    fs.unlinkSync(tmpPng);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    try {
      fs.unlinkSync(tmpPng);
    } catch {}
    return null;
  }
}

const iconCache = new Map();
ipcMain.handle("wheel:get-icon", (_e, appName) => {
  if (!iconCache.has(appName)) iconCache.set(appName, readAppIcon(appName));
  return iconCache.get(appName);
});

ipcMain.handle("wheel:get-config", () => readConfig());
ipcMain.handle("wheel:list-apps", () => listInstalledApps());
ipcMain.on("wheel:set-config", (_e, config) => {
  writeConfig(config);
  broadcastConfig();
});

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 720,
    height: 540,
    title: "switchdial — Settings",
    backgroundColor: "#1c1c1c",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
  if (!app.isPackaged) {
    settingsWin.loadURL(`${DEV_URL}#settings`);
  } else {
    settingsWin.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: "settings",
    });
  }
}

function buildTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("◉");
  tray.setToolTip("switchdial");
  // Tray icon left-click only opens the context menu — never the wheel.
  // The wheel is triggered by the global hotkey or Option+click.
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Hotkey: ${HOTKEY}`, enabled: false },
      { label: "Settings…", click: openSettings },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ]),
  );
}

function startInputHook() {
  try {
    ({ uIOhook, UiohookKey } = require("uiohook-napi"));
  } catch (err) {
    console.error("[wheel] uiohook require failed:", err);
    return;
  }

  uIOhook.on("keydown", (e) => {
    if (e.keycode === UiohookKey.Alt) {
      optionDown = true;
      // Cover the screen now, before the user has a chance to click.
      showOverlay(screen.getCursorScreenPoint());
    }
    if (e.keycode === UiohookKey.Escape && (overlayShown || wheelOpen)) {
      hideWheel();
    }
  });
  uIOhook.on("keyup", (e) => {
    if (e.keycode === UiohookKey.Alt) {
      optionDown = false;
      // If they let go without clicking, drop the overlay.
      if (!wheelOpen) hideWheel();
    }
  });

  uIOhook.on("mousedown", (e) => {
    if (e.button !== 1) return;
    if (overlayShown && !wheelOpen) {
      // Option held + click — gesture mode. mouseup will commit.
      showWheelAt({ x: e.x, y: e.y }, "gesture");
    } else if (wheelOpen && openMode === "menu") {
      // Menu mode (opened via hotkey/tray) — a deliberate click commits.
      win.webContents.send("wheel:commit");
    }
  });

  uIOhook.on("mousemove", (e) => {
    if (!wheelOpen || !gestureOrigin) return;
    win.webContents.send("wheel:cursor", {
      dx: e.x - gestureOrigin.x,
      dy: e.y - gestureOrigin.y,
    });
  });

  uIOhook.on("mouseup", (e) => {
    if (e.button !== 1) return;
    if (!wheelOpen) return;
    // Only the gesture mode (Option+drag) commits on release. In menu mode
    // we ignore mouseups so the tray/hotkey click that opened the wheel
    // doesn't immediately close it.
    if (openMode === "gesture") {
      win.webContents.send("wheel:commit");
    }
  });

  try {
    uIOhook.start();
    console.log("[wheel] uiohook started");
  } catch (err) {
    console.error("[wheel] uiohook start failed:", err);
  }
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  const isFirstRun = !configExists();
  createWindow();
  buildTray();
  startInputHook();
  if (isFirstRun) {
    // Persist an empty config so we don't auto-open again, then nudge the
    // user to set up their apps.
    writeConfig({ segments: EMPTY_SEGMENTS });
    openSettings();
  }

  const ok = globalShortcut.register(HOTKEY, () => {
    if (wheelOpen) hideWheel();
    else showWheelAt(screen.getCursorScreenPoint(), "menu");
  });
  console.log(`[wheel] ${HOTKEY} registered: ${ok}`);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (uIOhook) uIOhook.stop();
});
app.on("window-all-closed", (e) => e.preventDefault());
// Re-launching the .app from Finder/Spotlight while it's already running
// fires `activate` — open Settings so the user has something to interact with.
app.on("activate", () => openSettings());
