-- =============================================================================
-- 4663 — PONS V2 Global Fees Paid Phase 1
-- Additive. Isolated from RADAR qualification, continuation fire, and worker
-- scheduling. Does not rewrite pons_launches, fire_* RPCs, or chain_cursors.
--
-- Pre-graduation Global Fees Paid (quote-token wei, never native-named):
--   sum(CurveBuy.fee + CurveBuy.tax) + sum(CurveSell.fee + CurveSell.tax)
-- Emitted event values only. Never derive from volume/bps.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) pons_v2_curve_fee_events — idempotent ledger (one row per log)
-- -----------------------------------------------------------------------------

CREATE TABLE public.pons_v2_curve_fee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663,
  token_address text NOT NULL,
  curve_address text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  side text NOT NULL,
  fee_raw numeric(78, 0) NOT NULL,
  tax_raw numeric(78, 0) NOT NULL,
  total_fee_raw numeric(78, 0) GENERATED ALWAYS AS (fee_raw + tax_raw) STORED,
  venue text NOT NULL DEFAULT 'curve',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pons_v2_curve_fee_events_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_v2_curve_fee_events_curve_address_norm_check
    CHECK (curve_address = lower(curve_address) AND curve_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_v2_curve_fee_events_tx_hash_norm_check
    CHECK (tx_hash = lower(tx_hash) AND tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT pons_v2_curve_fee_events_log_index_check
    CHECK (log_index >= 0),
  CONSTRAINT pons_v2_curve_fee_events_block_number_check
    CHECK (block_number >= 0),
  CONSTRAINT pons_v2_curve_fee_events_side_check
    CHECK (side IN ('buy', 'sell')),
  CONSTRAINT pons_v2_curve_fee_events_fee_raw_check
    CHECK (fee_raw >= 0),
  CONSTRAINT pons_v2_curve_fee_events_tax_raw_check
    CHECK (tax_raw >= 0),
  CONSTRAINT pons_v2_curve_fee_events_total_fee_raw_check
    CHECK (total_fee_raw >= 0),
  CONSTRAINT pons_v2_curve_fee_events_venue_check
    CHECK (venue = 'curve'),
  CONSTRAINT pons_v2_curve_fee_events_unique
    UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX pons_v2_curve_fee_events_token_block_idx
  ON public.pons_v2_curve_fee_events (chain_id, token_address, block_number);

CREATE INDEX pons_v2_curve_fee_events_curve_idx
  ON public.pons_v2_curve_fee_events (chain_id, curve_address);

COMMENT ON TABLE public.pons_v2_curve_fee_events IS
  'Idempotent PONS V2 bonding-curve fee ledger. One row per CurveBuy/CurveSell log. Quote-token wei. Not a RADAR event.';

COMMENT ON COLUMN public.pons_v2_curve_fee_events.fee_raw IS
  'Emitted CurveBuy/CurveSell.fee in quote-token wei (numeric, never float).';

COMMENT ON COLUMN public.pons_v2_curve_fee_events.tax_raw IS
  'Emitted CurveBuy/CurveSell.tax in quote-token wei (numeric, never float).';

COMMENT ON COLUMN public.pons_v2_curve_fee_events.total_fee_raw IS
  'fee_raw + tax_raw. Generated so ledger totals cannot drift from emitted parts.';

COMMENT ON COLUMN public.pons_v2_curve_fee_events.venue IS
  'Pre-graduation bonding curve. Post-graduation hook fees are a later stream.';

ALTER TABLE public.pons_v2_curve_fee_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pons_v2_curve_fee_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pons_v2_curve_fee_events TO service_role;

-- -----------------------------------------------------------------------------
-- 2) token_fee_metrics — per-token quote-denominated aggregates
-- -----------------------------------------------------------------------------

CREATE TABLE public.token_fee_metrics (
  chain_id integer NOT NULL DEFAULT 4663,
  token_address text NOT NULL,
  launchpad text NOT NULL DEFAULT 'pons',
  factory_version text NOT NULL DEFAULT 'v2',
  quote_token_address text NOT NULL,
  global_fees_paid_quote numeric(78, 0) NOT NULL DEFAULT 0,
  buy_fees_quote numeric(78, 0) NOT NULL DEFAULT 0,
  sell_fees_quote numeric(78, 0) NOT NULL DEFAULT 0,
  buy_count integer NOT NULL DEFAULT 0,
  sell_count integer NOT NULL DEFAULT 0,
  last_fee_block bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT token_fee_metrics_pkey
    PRIMARY KEY (chain_id, token_address),
  CONSTRAINT token_fee_metrics_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT token_fee_metrics_quote_token_address_norm_check
    CHECK (
      quote_token_address = lower(quote_token_address)
      AND quote_token_address ~ '^0x[0-9a-f]{40}$'
    ),
  CONSTRAINT token_fee_metrics_launchpad_check
    CHECK (launchpad = 'pons'),
  CONSTRAINT token_fee_metrics_factory_version_check
    CHECK (factory_version = 'v2'),
  CONSTRAINT token_fee_metrics_global_fees_paid_quote_check
    CHECK (global_fees_paid_quote >= 0),
  CONSTRAINT token_fee_metrics_buy_fees_quote_check
    CHECK (buy_fees_quote >= 0),
  CONSTRAINT token_fee_metrics_sell_fees_quote_check
    CHECK (sell_fees_quote >= 0),
  CONSTRAINT token_fee_metrics_buy_count_check
    CHECK (buy_count >= 0),
  CONSTRAINT token_fee_metrics_sell_count_check
    CHECK (sell_count >= 0),
  CONSTRAINT token_fee_metrics_last_fee_block_check
    CHECK (last_fee_block >= 0)
);

CREATE TRIGGER token_fee_metrics_set_updated_at
  BEFORE UPDATE ON public.token_fee_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.token_fee_metrics IS
  'PONS V2 Global Fees Paid aggregates in quote-token wei. Not native/ETH-named. Isolated from RADAR continuation.';

COMMENT ON COLUMN public.token_fee_metrics.global_fees_paid_quote IS
  'Sum of inserted CurveBuy/CurveSell (fee+tax). Quote-token wei. Incremented only when a ledger row is newly inserted.';

COMMENT ON COLUMN public.token_fee_metrics.quote_token_address IS
  'Quote token for these amounts. 0x000…000 means native ETH as pairToken; the metric is still quote-denominated, not native-named.';

COMMENT ON COLUMN public.token_fee_metrics.last_fee_block IS
  'Diagnostic high-water block. GREATEST(existing, incoming). Not the idempotency key.';

ALTER TABLE public.token_fee_metrics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.token_fee_metrics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.token_fee_metrics TO service_role;

-- -----------------------------------------------------------------------------
-- 3) apply_pons_v2_curve_fees — one transaction: ledger insert then aggregate
-- Replaying the same (chain_id, tx_hash, log_index) must not change totals.
-- fee_raw / tax_raw MUST be JSON strings (never JSON numbers) to preserve
-- uint256 precision through jsonb.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_pons_v2_curve_fees(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event jsonb;
  v_inserted integer;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_chain_id integer;
  v_token text;
  v_curve text;
  v_tx text;
  v_log_index integer;
  v_block bigint;
  v_side text;
  v_fee numeric(78, 0);
  v_tax numeric(78, 0);
  v_total numeric(78, 0);
  v_quote text;
  v_buy_fees numeric(78, 0);
  v_sell_fees numeric(78, 0);
  v_buy_count integer;
  v_sell_count integer;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'apply_pons_v2_curve_fees: p_events must be a JSON array';
  END IF;

  FOR v_event IN
    SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF jsonb_typeof(v_event) <> 'object' THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: each event must be a JSON object';
    END IF;

    IF jsonb_typeof(v_event->'fee_raw') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_event->'tax_raw') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: fee_raw and tax_raw must be decimal strings';
    END IF;

    IF (v_event->>'fee_raw') !~ '^[0-9]+$'
       OR (v_event->>'tax_raw') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: fee_raw/tax_raw must be unsigned decimal integers';
    END IF;

    v_chain_id := (v_event->>'chain_id')::integer;
    v_token := lower(v_event->>'token_address');
    v_curve := lower(v_event->>'curve_address');
    v_tx := lower(v_event->>'tx_hash');
    v_log_index := (v_event->>'log_index')::integer;
    v_block := (v_event->>'block_number')::bigint;
    v_side := lower(v_event->>'side');
    v_quote := lower(v_event->>'quote_token_address');
    v_fee := (v_event->>'fee_raw')::numeric(78, 0);
    v_tax := (v_event->>'tax_raw')::numeric(78, 0);
    v_total := v_fee + v_tax;

    IF v_chain_id IS NULL
       OR v_log_index IS NULL
       OR v_block IS NULL
       OR v_token IS NULL
       OR v_curve IS NULL
       OR v_tx IS NULL
       OR v_side IS NULL
       OR v_quote IS NULL THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: missing required fields';
    END IF;

    IF v_log_index < 0 OR v_block < 0 OR v_fee < 0 OR v_tax < 0 THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: amounts, block, and log_index must be non-negative';
    END IF;

    IF v_side NOT IN ('buy', 'sell') THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: side must be buy or sell';
    END IF;

    IF v_token !~ '^0x[0-9a-f]{40}$'
       OR v_curve !~ '^0x[0-9a-f]{40}$'
       OR v_quote !~ '^0x[0-9a-f]{40}$' THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: invalid address';
    END IF;

    IF v_tx !~ '^0x[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'apply_pons_v2_curve_fees: invalid tx_hash';
    END IF;

    IF v_side = 'buy' THEN
      v_buy_fees := v_total;
      v_sell_fees := 0;
      v_buy_count := 1;
      v_sell_count := 0;
    ELSE
      v_buy_fees := 0;
      v_sell_fees := v_total;
      v_buy_count := 0;
      v_sell_count := 1;
    END IF;

    INSERT INTO public.pons_v2_curve_fee_events (
      chain_id,
      token_address,
      curve_address,
      tx_hash,
      log_index,
      block_number,
      side,
      fee_raw,
      tax_raw,
      venue
    ) VALUES (
      v_chain_id,
      v_token,
      v_curve,
      v_tx,
      v_log_index,
      v_block,
      v_side,
      v_fee,
      v_tax,
      'curve'
    )
    ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.token_fee_metrics (
      chain_id,
      token_address,
      launchpad,
      factory_version,
      quote_token_address,
      global_fees_paid_quote,
      buy_fees_quote,
      sell_fees_quote,
      buy_count,
      sell_count,
      last_fee_block
    ) VALUES (
      v_chain_id,
      v_token,
      'pons',
      'v2',
      v_quote,
      v_total,
      v_buy_fees,
      v_sell_fees,
      v_buy_count,
      v_sell_count,
      v_block
    )
    ON CONFLICT (chain_id, token_address) DO UPDATE SET
      global_fees_paid_quote =
        public.token_fee_metrics.global_fees_paid_quote + EXCLUDED.global_fees_paid_quote,
      buy_fees_quote =
        public.token_fee_metrics.buy_fees_quote + EXCLUDED.buy_fees_quote,
      sell_fees_quote =
        public.token_fee_metrics.sell_fees_quote + EXCLUDED.sell_fees_quote,
      buy_count = public.token_fee_metrics.buy_count + EXCLUDED.buy_count,
      sell_count = public.token_fee_metrics.sell_count + EXCLUDED.sell_count,
      last_fee_block =
        GREATEST(public.token_fee_metrics.last_fee_block, EXCLUDED.last_fee_block),
      updated_at = now();

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'applied', v_applied,
    'skipped', v_skipped
  );
END;
$$;

COMMENT ON FUNCTION public.apply_pons_v2_curve_fees(jsonb) IS
  'Atomic PONS V2 curve-fee apply. INSERT ledger ON CONFLICT DO NOTHING; mutate token_fee_metrics only when a row was inserted. Quote-token wei strings. Not a RADAR fire RPC.';

REVOKE ALL ON FUNCTION public.apply_pons_v2_curve_fees(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_pons_v2_curve_fees(jsonb) TO service_role;
