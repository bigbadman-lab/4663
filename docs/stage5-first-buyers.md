# Stage 5 — Transfer scanning + PonsBuy v0 + first buyers

## 1. Research sources reused

| Concern | File | Functions |
| --- | --- | --- |
| Strict detector | `pons-data-lab/src/normalize/detect-pons-buy.ts` | `detectPonsBuyV0`, `decodeErc20Transfer` |
| Buy type semantics | `pons-data-lab/src/normalize/pons-buy.ts` | `PonsBuy` notes |
| Dataset builder path | `pons-data-lab/src/probes/build-pons-buys.ts` | getLogs candidates → **tx + receipt** → detector |
| Transfer getLogs cost | `output/experiments/transfer-log-benchmark.json` | conservative **225 addrs / 5k blocks** |

### Important research fact

**Receipts are required** by the proven detector (`receipt.status === "success"` and qualifying Transfers inspected on **receipt logs**).  
Stage 5 preserves this cost for **unconfirmed wallets only** (first-wallet optimisation). No receipt/tx for already-confirmed wallets.

Cost models later talking about “receipts = 0” are planning notes for alternate designs — **not** the proven PonsBuy v0 implementation.

## 2. Transfer decoding

`src/lib/pons/transfer/decode.ts`  
Canonical topic0 `Transfer(address,address,uint256)`.  
Fields: token/from/to/amount/tx/block/logIndex — lowercase addresses/hashes.

## 3. Active address batching

Only ACTIVE launches in runtime `activeTokens` (rebuild from Supabase on boot).  
Tokens partitioned into batches of **`TRANSFER_ADDRESS_BATCH_SIZE = 100`** (under research 225 cap).

## 4. Block range size

Outer transfer catch-up: **`TRANSFER_SCAN_MAX_CHUNK_BLOCKS = 2000`**.  
Inner adaptive chunks start at **10** (Alchemy free-tier evidence), grow to max.

## 5. Address batch size

**100** active token addresses per `eth_getLogs` request.

## 6. Candidate filter

From getLogs Transfer:

- token is ACTIVE watch address  
- `block >= launch_block`  
- `from == known market`  
- `amount > 0`  
- candidate wallet = `to`

## 7. First-wallet optimisation

If `confirmedBuyers[token].has(wallet)` → **skip all RPC** for that candidate.  
Per-range: after first durable confirm, further candidates for same pair ignore tx lookup.

Failed strict validation on one tx does **not** permanently black-hole the wallet; later independent txs may still validate.

## 8. PonsBuy v0 production semantics

Port of research detector:

1. `receipt.status === success`  
2. `tx.from` non-zero  
3. ≥1 token Transfer on receipt: `from == market`, `to == tx.from`, `amount > 0`  
4. Buyer = `tx.from`  

Deterministic not-buy reasons vs operational `unable_to_validate`.

## 9. RPC calls

| Call | When |
| --- | --- |
| eth_getLogs (Transfer topic0 + token address batch) | every transfer range |
| eth_getTransactionByHash | unconfirmed candidate only |
| eth_getTransactionReceipt | unconfirmed candidate only (required) |
| eth_getBlockByNumber | first-buy timestamp (cached per block) |

## 10. Receipts

**Required** for strict PonsBuy v0 success evidence (research).

## 11. First-buyer persistence

Table `pons_first_buyers` insert-only on conflict-do-nothing path:  
never overwrite earlier `first_buy_*` fields.  
Timestamp = chain block.timestamp of confirmed buy block.

## 12. Factory / transfer cursor ordering

Independent streams.

**Hard invariant:** before committing `pons_transfers` through block `N`,  
`pons_factories.last_processed_block >= N`.

Ordering per poll:

1. catch up factories  
2. catch up transfers (pulls factories forward if lagging)  
3. heartbeat  

New launches join `activeTokens` RAM immediately (Stage 4 option A retained).

## 13. Restart / replay

- Startup loads ACTIVE + first buyers → RAM  
- 5-block rewind on transfer/factory streams  
- Unique first buyers; confirmed wallet skip after reconstruct  

## 14. Live validation evidence

Real Alchemy + Supabase bounded scan:

```bash
npm run worker:scan-transfers -- --from-block 33485429 --to-block 33486000
```

**First pass**

| Metric | Value |
| --- | --- |
| ACTIVE tokens | 27 |
| Transfer logs | 44 |
| market→wallet candidates | 22 |
| tx+receipt validations | 21 |
| new first buyers | 20 |
| known | 0 |
| notBuys | 1 |
| fullyProcessed | true |

Example:

- token `0x6ab238408e50fd22c60d1f82ec9485792c79d90e`
- market `0x876c4aa6492c03c59a8f9163aff90eeadb20b37d` (Stage 4)
- wallet `0x63b6696e0e82b5904c83319ecf35168635129cc3`
- first-buy block `33485529`
- strict confirmed → `pons_first_buyers` insert

**Replay (same range)**

| Metric | Value |
| --- | --- |
| candidates | 22 |
| tx+receipt validations | **1** (only residual notBuy) |
| newBuyers | **0** |
| confirmed wallets skipped | 21 |

No duplicate first-buyer rows.

## 15. Cost-conscious behaviour

- multi-address Transfer logs  
- 100-addr batches  
- tx+receipt only for unseen wallets  
- no rejected candidate persistence  
- no raw transfer dump  

## 16. Deferred

- rolling 180s evaluation  
- `events` / fired / expiry  
- sells, frontend, presence, Render  

## Commands

```bash
npm run worker:bootstrap-transfers -- --from-block <n>
# or --lookback <blocks> [--force]

npm run worker:scan-transfers -- --from-block X --to-block Y
# optional: --advance-cursor  (requires factories >= Y)

npm run worker
npm run worker:once
```
