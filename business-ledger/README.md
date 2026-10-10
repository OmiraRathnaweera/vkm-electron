# Business Ledger

A simple **offline desktop app** (Electron) for recording a small business's
**receipts, payments and balances** in monthly tables, with automatic
calculations and charts. It is built for a single user on a single computer and
**never needs an internet connection** once installed.

## Features

- **Monthly ledger tables** – columns: *Date, Description, Receipts, Payments, Balance*.
  - Create a table for any month when needed.
  - The **balance is calculated automatically** after every row.
  - Each month's **opening balance is carried forward** from the previous month
    (and can be overridden by hand, e.g. for the very first month).
- **Month-end totals** – total receipts, total payments, net change and closing
  balance, shown both as summary cards and as a totals row under the table.
- **Reports & charts page** – for any **week, month or year**:
  - bar chart of receipts vs payments (per day, or per month for a year)
  - line chart of the balance over time
  - pie charts: receipts vs payments, payments by description, receipts by description
- **Export / print** – export any month to **CSV** (opens in Excel) or
  **Print / Save as PDF**.
- **Safe storage** – data is saved automatically as you type, in a local file.
  Daily automatic backups (last 30 days) plus manual **Save backup / Restore**.
- Light & dark theme (follows the operating system).

### Accuracy

All amounts are stored as **whole cents (integers)**, never floating-point
numbers, so totals and balances never drift (e.g. `0.1 + 0.2` is exactly `0.30`).
Amounts accept up to 2 decimals; negative numbers and invalid text are rejected.
The calculation logic is covered by automated tests (`npm test`).

## Requirements

- [Node.js](https://nodejs.org/) **22.12 or newer** (current LTS recommended) – only on the
  *developer's* machine. The client does **not** need Node.js; they receive an installer.
- An internet connection **only while developing/building** (to download
  dependencies). The finished app runs fully offline.

## Setup (developer)

```bash
cd business-ledger
npm install        # downloads Electron, Chart.js and the packager
npm start          # runs the app in development mode
npm test           # runs the calculation unit tests
```

## Build an installer for the client

Build on the same operating system you are targeting (Windows installers are
best built on Windows, macOS builds on a Mac, etc.).

```bash
npm run dist:win     # Windows: NSIS installer + portable .exe  (in ./dist)
npm run dist:mac     # macOS:   .dmg
npm run dist:linux   # Linux:   AppImage + .deb
```

Give the client the file from the `dist/` folder (e.g. `Business Ledger Setup 1.0.0.exe`).
Windows will say "unknown publisher" unless the app is code-signed; this is
normal for unsigned apps (see *Customising* below).

## Where is the data stored?

In a single JSON file in the app's user-data folder:

| OS      | Location                                                    |
| ------- | ----------------------------------------------------------- |
| Windows | `%APPDATA%\Business Ledger\ledger-data.json`                |
| macOS   | `~/Library/Application Support/Business Ledger/ledger-data.json` |
| Linux   | `~/.config/Business Ledger/ledger-data.json`                |

Next to it you will find:

- `ledger-data.json.bak` – the previous version (kept on every save)
- `backups/ledger-YYYY-MM-DD.json` – one automatic snapshot per day (last 30 kept)

You can open this folder from **Settings & backup → Open data folder**.

> **Advise the client** to use **Settings & backup → Save backup copy…** now and
> then and store it on a USB drive or cloud folder, because the data otherwise
> exists only on this one computer.

## How to use

1. Open **Ledger**. If the month has no table yet, click **Create table for …**.
2. (First month only) type the starting balance in the **Opening balance** row, if any.
3. Click **+ Add row** and fill in *Date*, *Description* and either a *Receipt*
   or a *Payment* amount. Press **Enter** to jump to the next cell; Enter in the
   last cell of the last row adds a new row.
4. The **Balance** column and the **totals** update instantly.
   Use **Sort by date** if rows were entered out of order.
5. Use ◀ ▶ or the month picker to move between months.
   **Jump to saved month…** lists the months that already have data.
6. Open **Reports & charts** and choose **Week / Month / Year** to see the
   overview. Use ◀ ▶ to move to other periods.

Notes on behaviour:

- A row's date must fall inside the month of its table.
- A balance can go **negative** (shown in red) – nothing blocks overdrafts.
- If an earlier month's entries are edited, later months' carried-forward
  opening balances update automatically (unless they were set manually).
- Deleting a month removes all its rows – the app asks for confirmation.

## Project structure

```
business-ledger/
├── main.js            Electron main process: window, file storage, backups, dialogs
├── preload.js         Safe bridge between the UI and the main process (contextIsolation)
├── src/
│   ├── index.html     App shell (strict Content-Security-Policy, no network)
│   ├── styles.css     Styling (light/dark/print)
│   ├── logic.js       Pure calculation code: money, balances, reports, CSV
│   └── app.js         UI: ledger, reports/charts, settings
├── test/logic.test.js Unit tests for the calculation logic
└── package.json       Scripts and electron-builder configuration
```

Design notes:

- **No database server and no native modules** – data is plain JSON written
  atomically (temp file → rename), so installation and packaging are trouble-free
  on every OS.
- Charts use **Chart.js**, loaded from `node_modules` (not a CDN), so they work offline.
- Security: `contextIsolation` on, `nodeIntegration` off, sandboxed renderer,
  navigation and new windows blocked, UI built without `innerHTML`.

## Customising

- **App name / ID / version / author** – edit `name`, `productName`, `version`,
  `author` and `build.appId` in `package.json`.
- **Currency label & business name** – in-app under *Settings & backup*.
- **App icon** – create a `build/` folder containing `icon.ico` (Windows),
  `icon.icns` (macOS) and/or `icon.png` (512×512, Linux); electron-builder picks them up automatically.
- **Code signing** (removes the "unknown publisher" warning) – see the
  [electron-builder code-signing docs](https://www.electron.build/code-signing).
- **Auto-updates are intentionally not included**, since the app is offline-only.

## Ideas for later (not included)

- Categories/tags per entry, with category-based charts
- Search and filter across months
- Optional password / data encryption
- Multiple businesses or currencies
- Import from Excel/CSV

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `npm start` says Electron failed to install | Run `npm install` again with internet access; delete `node_modules` first if needed. |
| Charts page says "Charts unavailable" | `node_modules/chart.js` is missing – run `npm install`. |
| Windows SmartScreen warning on the installer | Normal for unsigned apps – click *More info → Run anyway*, or code-sign the build. |
| Moved to a new computer | Use *Save backup copy…* on the old one, then *Restore from backup…* on the new one. |
