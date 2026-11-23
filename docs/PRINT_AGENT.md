# QuickPrint Print Agent

_QuickPrint UAE — Powered by Nexsofture Tech_

The print agent is a tiny program that runs on the **shop PC next to the printer**. It pulls paid walk-in jobs from the shop's queue (highest priority first, then first-come-first-served) and sends them to the printer. Customers scan the shop's QR, upload and pay on their phone; the agent does the rest.

## Install
1. Install **Node.js 20+** on the shop PC.
2. Copy the `print-agent/` folder to the PC (no `npm install` needed — zero dependencies).
3. In the shop admin go to **Walk-in queue → Print agents → Add agent**. Copy the key (`qpa_…`). It is shown **once**.
4. Run:
   ```
   node agent.mjs --server https://yourshop.example --key qpa_XXXX --printer "HP LaserJet"
   ```
   Or save settings once in `~/.quickprint-agent.json`:
   ```json
   { "server": "https://yourshop.example", "key": "qpa_XXXX", "printer": "HP LaserJet" }
   ```
   Environment variables also work: `QP_SERVER`, `QP_KEY`, `QP_PRINTER`, `QP_POLL`, `QP_SUMATRA`.
5. Keep it running (see "Run at startup"). The admin page shows the agent **online** when it checked in within the last 2 minutes.

Flags: `--printer NAME` (default printer if omitted), `--poll 3` (seconds), `--once` (process the queue then exit), `--fake-printer DIR` (save files to a folder instead of printing — for testing), `--sumatra PATH` (Windows), `--help`.

## What it prints with
| OS | Tool | Notes |
|---|---|---|
| macOS / Linux | CUPS `lp` | copies, duplex (`sides=two-sided-long-edge`), paper size (`media=`), colour/mono (`print-color-mode=`) |
| Windows | **SumatraPDF** (portable, free) | needs `SumatraPDF.exe` on PATH or `--sumatra "C:\path\SumatraPDF.exe"`; PDFs and images |
| Word / PowerPoint / Excel | **LibreOffice** headless (`soffice`) converts to PDF first | if LibreOffice is missing the job becomes **Needs manual print** and shows in the dashboard with a download button |

Commands are built as argument arrays and run with `execFile` — never through a shell — so file names with spaces or quotes are safe.

## How a job flows
`awaiting payment → queued (after payment) → printing → printed → order "ready"`.
- A failed print is retried up to **3 times**, then marked **needs manual**.
- If the agent stops mid-job (PC off), the claim expires after **5 minutes** and the job returns to the queue.
- After the order is fully printed, files are deleted after the shop's retention window (default 24 h).

## Security
- The key identifies **one shop**; the agent can never see another shop's jobs. Keys are stored hashed. Revoke a key in the admin and it stops working immediately.
- The agent can only download a file for a job **it has claimed** and that is currently printing. Each download is audit-logged.
- Requests are rate-limited (120/min per key).
- Use HTTPS for `--server`.

## Run at startup
- **Windows:** Task Scheduler → "At log on" → `node C:\print-agent\agent.mjs` (or `nssm`).
- **macOS:** a LaunchAgent plist running `node /path/agent.mjs`.
- **Linux:** a systemd unit with `Restart=always`.

## Tested vs. not tested
Verified in CI/sandbox: command building for macOS/Linux/Windows (unit tests), the full agent HTTP API, and the real CLI end-to-end with `--fake-printer`. **Not verified:** actual output on a physical printer, SumatraPDF on Windows, and LibreOffice conversion — test with one real printer before go-live.

## Server cron (`GET /api/cron/walk-in?secret=$CRON_SECRET`, hourly)
Recovers stale claims, deletes uploads never attached to an order (> 6 h), and enforces file retention. The bundled `docker-compose.yml` schedules it, plus the daily `/api/cron/purge`.
