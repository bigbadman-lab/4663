-- =============================================================================
-- LAUNCH1 — Official 4663 token activation rail
--
-- Durable singleton for the official Robinhood Chain (4663) token contract.
-- Activation is operator-only via activate_official_4663_token (service_role).
-- Browser reads via server API (service role) — table is not anon-writable.
--
-- Does NOT activate a contract. Does NOT populate production.
-- Operator runs: npm run launch:activate-4663 -- --contract 0x...
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) official_token — chain singleton
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.official_token (
  chain_id integer PRIMARY KEY
    CHECK (chain_id = 4663),
  contract_address text NOT NULL
    CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  contract_address_normalized text NOT NULL
    CHECK (contract_address_normalized ~ '^0x[0-9a-f]{40}$'),
  activated_at timestamptz NOT NULL DEFAULT now(),
  activation_version text NOT NULL DEFAULT 'official-4663-v1'
    CHECK (activation_version = 'official-4663-v1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT official_token_normalized_matches_address CHECK (
    lower(contract_address) = contract_address_normalized
  ),
  CONSTRAINT official_token_not_zero_address CHECK (
    contract_address_normalized <> '0x0000000000000000000000000000000000000000'
  )
);

COMMENT ON TABLE public.official_token IS
  'Official 4663 token contract on Robinhood Chain. At most one row (chain_id=4663). Immutable after first activation except idempotent same-address reruns.';

COMMENT ON COLUMN public.official_token.contract_address IS
  'Operator-supplied address preserving original hex casing for copy/display.';

COMMENT ON COLUMN public.official_token.contract_address_normalized IS
  'Lowercase form used for equality checks.';

ALTER TABLE public.official_token ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies — reads go through Next.js API with service role.
-- service_role bypasses RLS.

REVOKE ALL ON TABLE public.official_token FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.official_token TO service_role;

-- -----------------------------------------------------------------------------
-- 2) activate_official_4663_token — immutable / idempotent activation
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_official_4663_token(
  p_chain_id integer,
  p_contract_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := trim(coalesce(p_contract_address, ''));
  v_normalized text;
  v_existing public.official_token%ROWTYPE;
BEGIN
  IF p_chain_id IS NULL OR p_chain_id <> 4663 THEN
    RETURN jsonb_build_object(
      'result', 'invalid_chain',
      'chain_id', p_chain_id
    );
  END IF;

  IF v_raw = '' OR v_raw !~ '^0x[0-9a-fA-F]{40}$' THEN
    RETURN jsonb_build_object(
      'result', 'invalid_address'
    );
  END IF;

  v_normalized := lower(v_raw);

  IF v_normalized = '0x0000000000000000000000000000000000000000' THEN
    RETURN jsonb_build_object(
      'result', 'invalid_address',
      'reason', 'zero_address'
    );
  END IF;

  -- Serialize activations (distinct from cutover 7001 / observation 7002)
  PERFORM pg_advisory_xact_lock(4663, 7003);

  SELECT *
  INTO v_existing
  FROM public.official_token
  WHERE chain_id = p_chain_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.contract_address_normalized = v_normalized THEN
      RETURN jsonb_build_object(
        'result', 'already_active',
        'chain_id', v_existing.chain_id,
        'contract_address', v_existing.contract_address,
        'activated_at', v_existing.activated_at,
        'activation_version', v_existing.activation_version
      );
    END IF;

    RETURN jsonb_build_object(
      'result', 'different_contract_already_active',
      'chain_id', v_existing.chain_id,
      'contract_address', v_existing.contract_address,
      'activated_at', v_existing.activated_at,
      'activation_version', v_existing.activation_version
    );
  END IF;

  INSERT INTO public.official_token (
    chain_id,
    contract_address,
    contract_address_normalized,
    activated_at,
    activation_version
  ) VALUES (
    p_chain_id,
    v_raw,
    v_normalized,
    now(),
    'official-4663-v1'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'result', 'activated',
    'chain_id', v_existing.chain_id,
    'contract_address', v_existing.contract_address,
    'activated_at', v_existing.activated_at,
    'activation_version', v_existing.activation_version
  );
END;
$$;

COMMENT ON FUNCTION public.activate_official_4663_token(integer, text) IS
  'Activate the official 4663 token once. Idempotent for same address; fails closed on different address.';

REVOKE ALL ON FUNCTION public.activate_official_4663_token(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_official_4663_token(integer, text) TO service_role;
