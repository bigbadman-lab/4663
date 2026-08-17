-- PONS V2 Global Fees Paid — 12-hour observation review.
-- Data collection only. Do not derive a RADAR threshold from these totals yet.
-- Quote amounts are numeric(78,0) quote-token wei (0x000…000 = native ETH pairToken).

-- 1) Ranked Global Fees Paid for observed V2 tokens
select
  m.token_address,
  m.quote_token_address,
  m.global_fees_paid_quote,
  m.buy_fees_quote,
  m.sell_fees_quote,
  m.buy_count,
  m.sell_count,
  m.last_fee_block,
  m.updated_at,
  l.launch_block_number,
  l.launch_block_timestamp,
  l.status as launch_status,
  l.market_address as curve_address
from public.token_fee_metrics m
left join public.pons_launches l
  on l.chain_id = m.chain_id
 and l.token_address = m.token_address
where m.chain_id = 4663
  and m.launchpad = 'pons'
  and m.factory_version = 'v2'
order by m.global_fees_paid_quote desc, m.token_address asc;

-- 2) Distribution-ready raw values (copy as-is; keep as numeric strings in clients)
select
  token_address,
  quote_token_address,
  global_fees_paid_quote::text as global_fees_paid_quote,
  buy_fees_quote::text as buy_fees_quote,
  sell_fees_quote::text as sell_fees_quote,
  buy_count,
  sell_count,
  last_fee_block,
  updated_at
from public.token_fee_metrics
where chain_id = 4663
  and launchpad = 'pons'
  and factory_version = 'v2'
order by global_fees_paid_quote desc;

-- 3) Number of tokens with fee activity
select
  count(*) filter (where global_fees_paid_quote > 0) as tokens_with_fee_activity,
  count(*) as token_fee_metrics_rows,
  coalesce(sum(global_fees_paid_quote), 0) as sum_global_fees_paid_quote,
  coalesce(sum(buy_count), 0) as sum_buy_count,
  coalesce(sum(sell_count), 0) as sum_sell_count
from public.token_fee_metrics
where chain_id = 4663
  and launchpad = 'pons'
  and factory_version = 'v2';

-- 4) Highest fee totals
select token_address, quote_token_address, global_fees_paid_quote, buy_count, sell_count, last_fee_block, updated_at
from public.token_fee_metrics
where chain_id = 4663
  and launchpad = 'pons'
  and factory_version = 'v2'
  and global_fees_paid_quote > 0
order by global_fees_paid_quote desc
limit 25;

-- 5) Lowest non-zero fee totals
select token_address, quote_token_address, global_fees_paid_quote, buy_count, sell_count, last_fee_block, updated_at
from public.token_fee_metrics
where chain_id = 4663
  and launchpad = 'pons'
  and factory_version = 'v2'
  and global_fees_paid_quote > 0
order by global_fees_paid_quote asc, token_address asc
limit 25;

-- 6) Tokens with buys but zero sells
select token_address, quote_token_address, global_fees_paid_quote, buy_fees_quote, sell_fees_quote, buy_count, sell_count, last_fee_block, updated_at
from public.token_fee_metrics
where chain_id = 4663
  and launchpad = 'pons'
  and factory_version = 'v2'
  and buy_count > 0
  and sell_count = 0
order by global_fees_paid_quote desc;

-- 7) Tokens with sells
select token_address, quote_token_address, global_fees_paid_quote, buy_fees_quote, sell_fees_quote, buy_count, sell_count, last_fee_block, updated_at
from public.token_fee_metrics
where chain_id = 4663
  and launchpad = 'pons'
  and factory_version = 'v2'
  and sell_count > 0
order by sell_fees_quote desc, global_fees_paid_quote desc;

-- 8) Cursor vs factory barrier (operator check; fee must not outrun factories)
select
  stream_name,
  last_processed_block,
  updated_at
from public.chain_cursors
where chain_id = 4663
  and stream_name in ('pons_factories', 'pons_v2_curve_fees', 'pons_transfers')
order by stream_name;
