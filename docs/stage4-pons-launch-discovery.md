# Stage 4 — Live PONS launch discovery

Canonical research source: `/Users/alexattinger/Desktop/pons-data-lab`  
Product stream: `pons_factories` only (no Transfer / PonsBuy yet)

## 1. pons-data-lab sources reused

| Concern | Research file | Function / notes |
| --- | --- | --- |
| Factory addresses + topic0s + V1 landmarks | `src/pons/addresses.ts` | `PONS_V*`, `V*_FACTORY_TOPIC0*`, `V1_LAUNCH_HELPER`, `V1_HELPER_MARKET_DATA_TOPIC0`, `RHC_WETH` |
| Dual-address `eth_getLogs` + adaptive chunks | `src/probes/factory-logs.ts` | `getLogsChunk`, `fetchLogsBounded` (10-block free-tier start) |
| Launch extraction | `src/probes/build-launch-registry.ts` | `extractLaunchesFromLogs` |
| V2 market | `build-launch-registry.ts` | topics[2] + bytecode check |
| V1 market | `build-launch-registry.ts` | `resolveV1Market` multi-evidence receipt scoring |
| Registry truth for validation | `output/normalized/launch-registry.json` | token/market/tx/block samples |
| Factory log fixtures | `output/raw/factory-logs.json` | raw logs for unit fixtures |
| RPC client approach | `src/client.ts` | viem `createPublicClient` + `http` |

Token is always **factory log `topics[1]`** in the research extractor.  
**Do not invent alternative launchpad schemas.**

## 2. V1 launch resolution

1. Accept V1 factory logs with topic0 ∈ {A,B} and address-shaped topics[1] → token.
2. `eth_getTransactionReceipt(launch_tx)`
3. Score receipt candidates (exclude token/factory/WETH/helper):
   - bytecode, log emitter, token Transfer participation, structural landmarks  
     (`helper_data_word_1_pattern` and/or `factory_event_data_word`)
4. Require multi-evidence threshold; unique top score (helper tie-break).
5. Unresolved market → **fail the launch** (do not invent market, do not advance cursor past incomplete range).

## 3. V2 launch resolution

1. topic0 = V2 signature; token = topics[1]; market = topics[2] when address-shaped.
2. Confirm market bytecode via `eth_getCode`.
3. Missing topics[2] or empty code → unresolved fail.

## 4. RPC calls used

| Method | Purpose |
| --- | --- |
| `eth_blockNumber` | head / health |
| `eth_getLogs` | dual factory address filter, chunked |
| `eth_getBlockByNumber` | launch block timestamp (chain authority) |
| `eth_getTransactionReceipt` | V1 market resolution |
| `eth_getCode` | V1 candidate + V2 market bytecode |

Adapter: `src/lib/worker/chain/rpc.ts` (viem).

## 5. Factory batching

- One `getLogs` request per chunk with **both** factory addresses.
- Initial chunk: **10** blocks (Alchemy Free empirical limit from research).
- Adaptive reduce on range errors; soft grow up to **2000**.
- 80ms spacing + bounded 429 retries.

## 6. Block timestamps

- `launch_block_timestamp` from block.timestamp (unix → ISO for Postgres).
- Per-range Map cache of block number → timestamp (avoid duplicate RPCs for same block).
- Never use worker wall clock for launch time.

## 7. Cursor bootstrap (operator)

No genesis scan. Explicit only:

```bash
npm run worker:bootstrap-factories -- --from-block <n>
npm run worker:bootstrap-factories -- --lookback <blocks>
# existing cursor: add --force
```

Sets `last_processed_block = max(0, startBlock - 1)` so next scan begins at `startBlock`.

## 8. Normal cursor progression

```text
durable N = last_processed_block
steady from = N + 1
startup in-memory from = max(0, N - 5)   # rewind not written to DB
```

After each fully successful range `[from,to]`:

1. resolve + persist all launches  
2. **then** upsert cursor to `to`

On any unresolved launch/RPC/DB failure in the range: **do not advance** past previous durable N.

## 9. Replay semantics

- Insert uses unique `(chain, token)` / `(chain, launch_tx)`  
- Conflicts → load existing, **never** force `status=active` onto fired/expired  
- Startup rewind re-scans recent blocks safely (idempotent)

## 10. Persistence semantics

`pons_launches` columns written:

`chain_id`, `factory_version`, `factory_address`, `token_address`, `market_address`,  
`launch_tx_hash`, `launch_block_number`, `launch_block_timestamp`, `status=active`

Newly inserted ACTIVE rows are also injected into in-process `activeTokens` (Stage 4 option A). Transfer watch is still Stage 5.

## 11. Failure behaviour

| Case | Behaviour |
| --- | --- |
| Non-launch factory log | ignored |
| Valid launch | resolve + idempotent insert |
| Unresolved market | loud fail; range incomplete |
| RPC error | range fails; cursor not advanced |
| DB error | range fails; cursor not advanced |

## 12. Live validation evidence

Executed against real Alchemy + Supabase:

```bash
npm run worker:scan-factories -- --from-block 33485420 --to-block 33486670
```

First pass: `inserted=6 known=0 fullyProcessed=true`  
Replay: `inserted=0 known=6 fullyProcessed=true` (idempotent)

Verified against `pons-data-lab` launch-registry:

| Version | Token | Market | Tx | Block |
| --- | --- | --- | --- | --- |
| V1 | `0x6ab2…d90e` | `0x876c…b37d` | `0x2964…8e07` | 33485429 |
| V2 | `0x1635…1511` | `0x3162…db9e` | `0xc830…d28b` | 33486660 |

Production lowercase fields matched research addresses (checksum-insensitive).  
Factory/version/status=`active` persisted as expected.

Additional: `worker:bootstrap-factories -- --from-block 33486670 --force` + `worker:once` (limited to one outer range) advanced cursor with startup rewind and further inserts.

## 13. Deferred

- Transfer log watch / first-buyer accumulation  
- PonsBuy v0  
- Rolling 180s event emission  
- `pons_transfers` cursor  
- Render deploy, frontend, presence  

## Commands

```bash
# Initialise factory cursor (required before continuous discovery)
npm run worker:bootstrap-factories -- --lookback 200

# Explicit bounded validation scan
npm run worker:scan-factories -- --from-block 33485420 --to-block 33486670

# Continuous worker (boot catch-up + 3s poll)
npm run worker
npm run worker:once
```
