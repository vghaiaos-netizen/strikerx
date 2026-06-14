# Railway Production Database

**Connection string (dev access — will be revoked after dev phase):**

```
postgresql://postgres:kTjrtolNAndbfZlUqEJcveUfOMmhmwxI@zephyr.proxy.rlwy.net:53876/railway
```

## Usage

### As environment variable
Set `RAILWAY_DATABASE_URL` to the string above in Replit Secrets.
The trading engine and migration scripts read from `RAILWAY_DATABASE_URL` when present.

### In the database tool (for agents)
Use `environment: "production"` in the database skill, or use the connection string directly for manual SQL:

```bash
psql "postgresql://postgres:kTjrtolNAndbfZlUqEJcveUfOMmhmwxI@zephyr.proxy.rlwy.net:53876/railway"
```

### Schema changes
For production schema changes, run DDL SQL directly via the database skill with this connection string.
**Never** run `pnpm --filter @workspace/db run push` against this DB — use raw `ALTER TABLE` / `CREATE TABLE` SQL only.

## Tables (as of binary trading refactor)

| Table | Purpose |
|---|---|
| `trading_assets` | Enabled trading pairs (BTC, ETH, SOL, BNB, TON) with payout ratios |
| `trading_positions` | All player trades — entry/exit price, direction, outcome |
| `players` | Player wallets and profile |
| `transactions` | All balance movements |
| `crash_rounds` | The Shot crash game rounds |
| `games` | Legacy casino game records (still active for The Shot) |
| `app_config` | DB-backed config — includes trading config keys |

## Trading config keys (in app_config)

| Key | Default | Description |
|---|---|---|
| `trading_enabled` | `true` | Master on/off switch |
| `trading_default_duration` | `60` | Default contract seconds |
| `trading_available_durations` | `30,60,300,900` | Options shown in UI |
| `trading_global_payout_ratio` | `1.82` | Win multiplier (overridden per-asset in trading_assets) |
| `trading_min_stake` | `10` | Min trade in STRIKER |
| `trading_max_stake` | `10000` | Max trade in STRIKER |
| `trading_big_win_threshold` | `1000` | Min STRIKER win to announce to group |
