# Step 9 - Daily Import Persistence

Goal: persist uploaded NinjaTrader daily files into Supabase instead of only keeping the parsed import in React/local fallback state.

## Tables Used

- `daily_imports`
  - One import row per client per trading date.
- `trading_accounts`
  - Upserted from import account registry so new accounts persist.
- `account_snapshots`
  - Account-level daily P&L, balance, drawdown, weekly P&L.
- `strategy_snapshots`
  - Strategy rows from NinjaTrader strategy exports.
- `orders`
  - Order rows used to preserve execution-to-strategy context.
- `executions`
  - Execution rows from NinjaTrader execution exports.
- `operational_flags`
  - Auto-generated flags for the import.

## Flow

1. User uploads CSV files.
2. Frontend parses and reconciles the files.
3. UI updates immediately.
4. Supabase upserts:
   - accounts
   - daily import row
   - snapshots
   - strategies
   - orders
   - executions
   - flags
5. Existing import for the same client/date is replaced with the new uploaded rows.

## Manual Verification

1. Upload daily files for one client.
2. Confirm import appears in the client workspace.
3. Refresh browser.
4. Confirm the same import still appears.
5. Run verification queries:

```sql
select c.name, di.trading_date, di.status, count(s.id) as snapshots
from public.daily_imports di
join public.clients c on c.id = di.client_id
left join public.account_snapshots s on s.daily_import_id = di.id
group by c.name, di.trading_date, di.status
order by di.trading_date desc, c.name;

select c.name, di.trading_date, f.type, f.severity, f.status
from public.operational_flags f
join public.clients c on c.id = f.client_id
left join public.daily_imports di on di.id = f.daily_import_id
order by di.trading_date desc, c.name, f.severity;
```

## Current Status

- Schema already exists.
- Code wiring completed.
- No new SQL is required for this step.
