# CAM CRM

Web-first Client Account Manager workspace for manually closing each client's NinjaTrader day without relying on the old Excel workbook.

## Local Development

```bash
npm install
npm run dev
```

Open the local Vite URL, usually `http://127.0.0.1:5173/`.

## Demo Workflow

1. Add a client in the left sidebar.
2. Select the client.
3. Keep the date as today's close, or choose a historical close date.
4. Upload the four NinjaTrader CSV exports for that client:
   - accounts
   - strategies
   - orders
   - positions/executions
5. The importer detects file type by normalized column headers, not by filename or column order.
6. Review flags and classify new accounts manually.
7. Classifications persist in the client's account registry.
8. Use `Build Daily Report` to open the printable client-safe daily report.

## MVP Rules

- One account manager workspace: Pedro.
- One client's CSV files per upload.
- Excel files are reference/migration material only, not daily source of truth.
- Account classification is manual the first time and persistent afterward.
- Cash accounts appear as their own tab only when a client has Cash accounts.
- Bullet Bot is part of Evaluations.
- Client report uses "aggregate balance" language and hides internal notes/credentials.

## Verification

```bash
npm test
npm run build
npm run lint
```

Sensitive local data is intentionally ignored by git:

- Excel workbooks
- NinjaTrader CSV exports
- NinjaTrader strategy/set files
