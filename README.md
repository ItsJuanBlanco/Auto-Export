# PR: Endpoint de importación automática desde NinjaTrader (watcher)

## Qué agrega esto

- **`api/import/daily.js`** — recibe el lote diario (accounts/strategies/orders/
  executions) que exporta NinjaTrader vía un AddOn + un watcher en Python que
  corre en cada VPS de cliente, y lo escribe en Supabase siguiendo exactamente el
  mismo flujo que ya está documentado en `supabase/step_9_daily_import_persistence.md`.

## Identificación y seguridad (integrado con `src/domain/ingestAuth.js`)

Este endpoint usa el resolver `resolveClientForIngest` (ya committeado por Pedro)
para identificar al cliente y hacer el "device binding":

```js
const { clientId } = await resolveClientForIngest(admin, {
  productKey: req.headers['x-product-key'],
  machineId: req.headers['x-machine-id'],
});
```

- El watcher manda `x-product-key` (el product_key del cliente) y `x-machine-id`
  (MachineGuid de Windows de ese VPS, estable entre reinicios).
- El primer upload registra la máquina contra el product_key; los siguientes se
  validan contra ese registro (tabla `ingest_devices`, migración
  `supabase/step_22_ingest_devices.sql`, la corre Natanel).
- Errores devueltos por el resolver: 401 (product_key inválido), 403 (máquina
  distinta a la registrada), 400 (falta algún header).

No hace falta ninguna API key compartida ni variable de entorno nueva en Vercel —
la Service Role Key sigue siendo la misma que ya usan `api/admin/*.js`.

## Cómo probarlo

```bash
curl -X POST https://cam-crm-vincere.vercel.app/api/import/daily \
  -H "x-product-key: EL_PRODUCT_KEY_DE_UN_CLIENTE_REAL" \
  -H "x-machine-id: test-machine-001" \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [{"AccountName": "Sim101", "RealizedPnL": "100", "UnrealizedPnL": "0", "NetLiquidation": "50100"}],
    "strategies": [],
    "orders": [],
    "executions": []
  }'
```

Primer request con esa combinación product_key + machine-id → 200 y registra la
máquina. Un segundo request con el mismo product_key pero otro machine-id → 403.
