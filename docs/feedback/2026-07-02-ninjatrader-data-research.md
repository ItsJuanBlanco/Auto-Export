# NinjaTrader 8 — Data Storage & Export Research (2026-07-02)

R&D companion to the manager review (§8). Goal: understand where NinjaTrader 8
(NT8) stores historical data, backtest results, and account/execution data, and
whether a script (ideally Python) on the machine could export what we need
automatically — so we can compare different clients' histories for the same
algos.

> **Sourcing caveat:** findings come from web-search summaries of the official
> NinjaTrader help guides and community forums/repos. Direct page fetches to
> `ninjatrader.com` were blocked by our network egress policy, so official
> claims are attributed to their help-guide URLs but not re-verified line by
> line. "Official" vs "community/unofficial" is flagged throughout.

---

## TL;DR (what's actually feasible)

- **Account / order / execution data → easy.** NT8 keeps this in a single local
  database file. Recent versions (~8.0.27.0+) use **SQLite**, which Python can
  read directly with the built-in `sqlite3` module. This is the low-effort win.
- **Historical price data (`.ncd`) → hard.** Proprietary, undocumented binary.
  Official export is manual (`.txt`, one instrument at a time). Community C#
  readers exist but there's no official/Python one.
- **Backtest results → medium.** Manual right-click "Export" to CSV/XML works
  today. Full automation needs a small NinjaScript (C#) add-on inside NT.
- **Best automated pipeline:** a C# NinjaScript add-on on the VPS exports what we
  need to CSV on a schedule → Python picks up the CSVs and pushes to our DB. For
  raw account/execution data, Python reading the SQLite DB directly skips even
  that.

---

## 1. File-system layout (Windows)

Everything lives under the **user data folder** (separate from the install dir):

```
C:\Users\<User>\Documents\NinjaTrader 8\
├─ db\                     internal database + historical data
│  ├─ NinjaTrader.sqlite   (~8.0.27.0+)  ← accounts, orders, executions, etc.
│  │  or NinjaTrader.sdf   (≤ ~8.0.27, SQL Server Compact)
│  ├─ tick\  minute\  day\ historical price data (.ncd files)
│  ├─ cache\               bar cache (regenerable, not source data)
│  └─ replay\              Market Replay recordings (.nrd files)
├─ templates\             Chart / Indicator / DrawingTool / TradingHours
├─ workspaces\            *.xml workspace layouts
├─ bin\Custom\            NinjaScript source → NinjaTrader.Custom.dll
├─ incoming\  outgoing\   ATI file-based interface (see §5)
├─ log\  trace\           logs
└─ (UI.xml and config/preset files at folder root)
```

Default backups go to the sibling folder `Documents\NinjaTrader 8 Backup\`.

Sources: [Data Files](https://ninjatrader.com/support/helpguides/nt8/data_files.htm),
[Function of /db directories (forum)](https://forum.ninjatrader.com/forum/ninjatrader-8/platform-technical-support-aa/1246408-function-of-db-directories).

---

## 2. Historical & Market Replay data

- **Location:** `db\tick`, `db\minute`, `db\day` hold historical data as **`.ncd`**
  files ("NinjaTrader Custom Data", replaced NT7's `.ntd`). Minute files can also
  carry sub-second Tick Replay data. `db\replay` holds **`.nrd`** Market Replay
  recordings (one subfolder per instrument, files named `YYYYMMDD.nrd`, tick-by-
  tick L1 + L2 depth).
- **Format:** both `.ncd` and `.nrd` are **proprietary, compressed, and
  undocumented** (bid/ask/last tagged in event sequence). No official spec.
- **Official export:** Control Center → **Tools → Historical Data** window →
  **Export** section. Produces plain-text **`.txt`**, always in **UTC**, **one
  instrument at a time**, with Bid/Ask/Last exported as separate files via the
  Data Type dropdown. **No native one-click CSV** (you convert the `.txt` after).
- **Community workarounds (unofficial):**
  - CSV exporters: [Aeromir Data Exporter](https://futures.aeromir.com/data-exporter), ChartToCSV.
  - Direct binary readers: [`jrstokka/NinjaTraderNCDFiles`](https://github.com/jrstokka/NinjaTraderNCDFiles) (C#, `.ncd`),
    [`bboyle1234/NTDFileReader`](https://github.com/bboyle1234/NTDFileReader) (C#/NuGet),
    [`eugeneilyin/nrdtocsv`](https://github.com/eugeneilyin/nrdtocsv) (`.nrd` replay → CSV, L1+L2).

Sources: [How to Export Historical Data](https://ninjatrader.com/support/helpguides/nt8/exporting.htm),
[Historical Data Window](https://ninjatrader.com/support/helpguides/nt8/historical_data_manager.htm),
[.ncd files thread](https://forum.ninjatrader.com/forum/ninjatrader-8/add-on-development/1281307-ninjatrader-historical-data-files-ncd-files).

**Takeaway:** getting clean historical price series out is the painful part.
Fine for occasional/manual pulls; not trivially automatable in Python without
porting the community C# readers or scripting the GUI export.

---

## 3. Strategy Analyzer / backtest results

- **Manual export (supported):** in Strategy Analyzer, select the **Trades**
  display (or any results grid), **right-click → Export**, choose **CSV / Excel**
  from the dropdown. The **Export** button emits both `.xml` and `.csv` (the CSV
  contains executions data).
- **Optimizations:** raise the **"Keep best # results"** property (default 10) to
  retain and export more result rows.
- **Persistence:** saved backtest results also live in the NT database (§4).
- **Automation:** no supported "export on a schedule" button — full automation
  means a NinjaScript strategy/indicator (§5) that writes CSV via
  `System.IO.StreamWriter` in `OnBarUpdate()`. This works **live, in Strategy
  Analyzer backtest, and in Playback**, and is NinjaTrader's officially
  documented way to get bar/indicator data out to a file Python can read.
  (Note: "Export NinjaScript" in the Distribution menu packages *code*, not
  data — different thing.)

Sources: [Exporting backtest trade data (forum)](https://forum.ninjatrader.com/forum/ninjatrader-8/add-on-development/1252923-exporting-strategy-back-test-trade-data-to-csv-or-xlsx),
[Automatic export of Strategy Analyzer results (forum)](https://forum.ninjatrader.com/forum/ninjatrader-8/add-on-development/109321-automatic-export-of-strategy-analyzer-backtest-results-to-csv-txt).

---

## 4. The internal database (accounts, orders, executions)

- **File:** `db\NinjaTrader.sqlite` (SQLite, **v~8.0.27.0+**) or the older
  `db\NinjaTrader.sdf` (**SQL Server Compact**, ≤ ~8.0.26.1/.27).
- **Tables (SDF/SQLite):** `Accounts`, `AccountItems`, `Executions`, `Orders`,
  `OrderUpdates`, `Positions`, `Strategies`, `Strategy2Account`,
  `Strategy2Execution`, `Instruments`, `MasterInstruments`, `InstrumentLists`,
  `JournalEntries`, `Logs`, `Users`, `Versions`, etc. Holds **historical trade
  execution data** and **saved Strategy Analyzer backtest results**.
- **External readability:**
  - **SQLite** → trivial from Python via `sqlite3` (read-only). This is the
    single biggest opportunity for us.
  - **SDF** → needs a SQL Server Compact 3.5/4.0 provider; awkward from Python.
    Easier to read via a small .NET tool or upgrade NT so it migrates to SQLite.
- **Caveat:** the file is **locked while NinjaTrader is running**. Read a **copy**
  of the file (or read when NT is closed) to avoid lock/corruption issues.

Sources: [Database (help guide)](https://ninjatrader.com/support/helpguides/nt8/database.htm),
[Getting data out of NinjaTrader.SDF (futures.io)](https://futures.io/ninjatrader/29750-getting-data-out-ninjatrader-sdf-sql-server-compact.html),
[Need to get all executions from DB (forum)](https://forum.ninjatrader.com/forum/ninjatrader-8/add-on-development/103707-need-to-get-all-executions-from-db).

---

## 5. Programmatic access options (viability)

| Approach | What it gets | Viability |
|---|---|---|
| **Read `NinjaTrader.sqlite` directly (Python `sqlite3`)** | Accounts, orders, executions, positions, saved backtest results | **High** if on ~8.0.27.0+. Copy the file first (lock). Best low-effort win. |
| **NinjaScript add-on (C#) inside NT** | Anything NT exposes: export historical data, executions, run + export backtests, on a schedule/hotkey | **High but needs C#.** Most robust *supported* automation path. Runs on the VPS. |
| **Manual GUI export** (Historical Data window / right-click grid) | `.txt` history, CSV backtest/executions | **High, but manual.** Fine to bootstrap, not to scale. |
| **ATI** — DLL (`NinjaTrader.Client.dll` / `NtDirect.dll`), OIF files (`incoming\`), or socket (localhost:**36973**) | Order routing + a **current-quote snapshot poll** and limited reads (filled qty, avg entry price, position, cash value) | **Order-only.** **Cannot export historical or backtest data.** No official Python client. Geared to *trading*, not bulk data. |
| **Community binary readers** (`jrstokka/NinjaTraderNCDFiles`, `NTDFileReader`, `nrdtocsv`) | Raw `.ncd` history, `.nrd` replay → CSV | **Medium, unofficial.** C#; may break on format changes. |
| **Third-party REST** (e.g. [CrossTrade API](https://crosstrade.io/blog/introducing-the-crosstrade-api)) | Remote order/account access | **Low priority.** External dependency + cost. |

Sources: [Automated Trading Interface (ATI)](https://ninjatrader.com/support/helpguides/nt8/automated_trading_interface_at.htm),
[ATI DLL Functions](https://ninjatrader.com/support/helpguides/nt8/functions.htm),
[NinjaTrader Desktop API](https://support.ninjatrader.com/s/article/NinjaTrader-Desktop-API).

---

## 6. Python feasibility — the practical recommendation

Yes, a Python script on the same Windows machine (the VPS) is realistic for the
**account/order/execution** data; **historical price data and backtests are
better handled by a small C# add-on**. Concrete plan:

1. **Confirm NT version** on the VPS. If **~8.0.27.0+**, the DB is SQLite → go
   straight to step 2. If older SDF, either upgrade NT (it migrates to SQLite) or
   plan a .NET reader.
2. **Accounts/executions (Python, now):** on a schedule, copy
   `db\NinjaTrader.sqlite` to a temp path, open read-only with `sqlite3`, pull
   `Accounts` / `Executions` / `Orders` / `Positions`, and push to our DB. No NT
   involvement, no GUI.
3. **Backtest results (C# add-on, later):** a NinjaScript add-on that runs the
   target algos over historical data and writes results to CSV in a watched
   folder; Python ingests the CSV. (Manual right-click export bridges the gap
   until the add-on exists.)
4. **Historical price series (only if needed):** either the community `.ncd`
   reader (C#) or scripted manual exports. Lowest priority; revisit once 2–3 are
   delivering value.

**Biggest early win:** reading the SQLite DB for execution history across all
clients' VPSs — that alone lets us compare the same algo across clients without
touching NinjaTrader's UI.

---

## Open questions to confirm on a real VPS

- Exact NT8 version (decides SQLite vs SDF).
- Whether NT runs 24/7 (affects when we can safely copy the DB file).
- Whether we can install a NinjaScript add-on on client VPSs (permissions).
- Volume/retention of `.ncd` history actually available per instrument.
