const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");
const Logic = require("./src/logic.js");

/* Only allow one copy of the app so two windows never overwrite each other. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

const dataFile = () => path.join(app.getPath("userData"), "ledger-data.json");
const backupOfDataFile = () => dataFile() + ".bak";
const backupDir = () => path.join(app.getPath("userData"), "backups");

/* ------------------------------------------------------------ persistence */

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadData() {
  for (const file of [dataFile(), backupOfDataFile()]) {
    if (!fs.existsSync(file)) continue;
    try {
      return Logic.normalizeData(readJSON(file));
    } catch (err) {
      console.error("Could not read", file, err);
    }
  }
  return Logic.defaultData();
}

/** Atomic save: write a temp file, keep the previous version as .bak, then rename. */
function saveData(data) {
  const clean = Logic.normalizeData(data);
  const file = dataFile();
  const tmp = file + ".tmp";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), "utf8");
  if (fs.existsSync(file)) fs.copyFileSync(file, backupOfDataFile());
  fs.renameSync(tmp, file);
}

/** One snapshot per day, keeping the most recent 30. */
function dailyBackup() {
  try {
    if (!fs.existsSync(dataFile())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const target = path.join(
      backupDir(),
      "ledger-" + Logic.todayISO() + ".json",
    );
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
    const old = fs
      .readdirSync(backupDir())
      .filter((f) => /^ledger-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse()
      .slice(30);
    for (const f of old) fs.unlinkSync(path.join(backupDir(), f));
  } catch (err) {
    console.error("Daily backup failed", err);
  }
}

/* ------------------------------------------------------------------- IPC */

function registerIpc() {
  ipcMain.handle("data:load", () => loadData());

  ipcMain.handle("data:save", (_e, data) => {
    saveData(data);
    return { ok: true };
  });

  ipcMain.handle("backup:export", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Save a backup copy",
      defaultPath: "ledger-backup-" + Logic.todayISO() + ".json",
      filters: [{ name: "Ledger backup", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { ok: false };
    fs.copyFileSync(dataFile(), filePath);
    return { ok: true, path: filePath };
  });

  ipcMain.handle("backup:import", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Restore from a backup file",
      properties: ["openFile"],
      filters: [{ name: "Ledger backup", extensions: ["json"] }],
    });
    if (canceled || !filePaths.length) return { ok: false };

    let imported;
    try {
      const raw = readJSON(filePaths[0]);
      if (!raw || typeof raw !== "object" || !raw.months)
        throw new Error("Not a ledger backup");
      imported = Logic.normalizeData(raw);
    } catch {
      await dialog.showMessageBox(mainWindow, {
        type: "error",
        message: "That file is not a valid ledger backup.",
      });
      return { ok: false };
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Cancel", "Replace my data"],
      defaultId: 0,
      cancelId: 0,
      message: "Replace ALL current data with this backup?",
      detail: "Your current data will be copied to a safety backup first.",
    });
    if (response !== 1) return { ok: false };

    // Safety copy of what is being replaced.
    try {
      fs.mkdirSync(backupDir(), { recursive: true });
      if (fs.existsSync(dataFile())) {
        fs.copyFileSync(
          dataFile(),
          path.join(backupDir(), "before-restore-" + Date.now() + ".json"),
        );
      }
    } catch (err) {
      console.error(err);
    }
    saveData(imported);
    return { ok: true, data: imported };
  });

  /* "Download": render the current screen with the print stylesheet and save it as a PDF file. */
  ipcMain.handle("file:save-pdf", async (_e, opts) => {
    const { suggestedName, landscape } = opts || {};
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Download as PDF",
      defaultPath: String(suggestedName || "ledger.pdf"),
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { ok: false };
    const target = /\.pdf$/i.test(filePath) ? filePath : filePath + ".pdf";
    const pdf = await mainWindow.webContents.printToPDF({
      pageSize: "A4",
      landscape: !!landscape,
      printBackground: true,
      margins: {
        marginType: "custom",
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4,
      }, // inches (~10 mm)
    });
    fs.writeFileSync(target, pdf);
    return { ok: true, path: target };
  });

  /* Generic "save this text to a file the user chooses" (used for CSV export). */
  ipcMain.handle(
    "file:save-text",
    async (_e, { suggestedName, content, filters }) => {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: String(suggestedName || "export.txt"),
        filters: Array.isArray(filters) ? filters : undefined,
      });
      if (canceled || !filePath) return { ok: false };
      fs.writeFileSync(filePath, String(content), "utf8");
      return { ok: true, path: filePath };
    },
  );

  /* HTML pieces of the UI: src/Components/*.html and src/Pages/*.html.
     Fixed folder list, no user-supplied paths. */
  ipcMain.handle("ui:fragments", () => {
    const out = {};
    for (const dir of ["Components", "Pages"]) {
      const full = path.join(__dirname, "src", dir);
      for (const file of fs.readdirSync(full)) {
        if (!file.endsWith(".html")) continue;
        out[dir + "/" + file.slice(0, -5)] = fs.readFileSync(
          path.join(full, file),
          "utf8",
        );
      }
    }
    return out;
  });

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    dataPath: dataFile(),
    backupPath: backupDir(),
  }));

  ipcMain.handle("app:open-data-folder", async () => {
    await shell.openPath(app.getPath("userData"));
  });
}

/* ---------------------------------------------------------------- window */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: "Business Ledger",
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  // This is an offline app: never navigate away or open new windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open data folder",
          click: () => shell.openPath(app.getPath("userData")),
        },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  dailyBackup();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});