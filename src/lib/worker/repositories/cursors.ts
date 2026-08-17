import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
} from "@/lib/pons/constants";
import {
  CURSOR_STREAM_POOLS_INSTANT,
  CURSOR_STREAM_POOLS_SWAPS,
} from "@/lib/pools/constants";
import type { CursorStreamName, PonsCursorStreamName } from "@/lib/pons/types";
import type { CursorRow } from "@/lib/worker/db-types";
import type { WorkerSupabase } from "@/lib/worker/supabase";

/** Cutover / observation RPCs mutate only these two streams. */
export const PONS_CURSOR_STREAMS: readonly PonsCursorStreamName[] = [
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
];

const KNOWN_STREAMS: readonly CursorStreamName[] = [
  ...PONS_CURSOR_STREAMS,
  CURSOR_STREAM_POOLS_INSTANT,
  CURSOR_STREAM_POOLS_SWAPS,
];

type CursorDbRow = {
  stream_name: string;
  chain_id: number;
  last_processed_block: number;
};

function mapCursor(row: CursorDbRow): CursorRow {
  return {
    streamName: row.stream_name as CursorStreamName,
    chainId: row.chain_id,
    lastProcessedBlock: row.last_processed_block,
  };
}

export async function loadCursor(
  supabase: WorkerSupabase,
  streamName: CursorStreamName,
  chainId: number,
): Promise<CursorRow | null> {
  const { data, error } = await supabase
    .from("chain_cursors")
    .select("stream_name, chain_id, last_processed_block")
    .eq("stream_name", streamName)
    .eq("chain_id", chainId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadCursor(${streamName}) failed: ${error.message}`,
    );
  }

  if (!data) return null;
  return mapCursor(data as CursorDbRow);
}

export async function loadKnownCursors(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<Map<CursorStreamName, CursorRow | null>> {
  const result = new Map<CursorStreamName, CursorRow | null>();

  const { data, error } = await supabase
    .from("chain_cursors")
    .select("stream_name, chain_id, last_processed_block")
    .eq("chain_id", chainId)
    .in("stream_name", [...KNOWN_STREAMS]);

  if (error) {
    throw new Error(
      `[4663-worker] loadKnownCursors failed: ${error.message}`,
    );
  }

  const byStream = new Map<string, CursorRow>();
  for (const row of (data ?? []) as CursorDbRow[]) {
    const mapped = mapCursor(row);
    byStream.set(mapped.streamName, mapped);
  }

  for (const stream of KNOWN_STREAMS) {
    result.set(stream, byStream.get(stream) ?? null);
  }

  return result;
}

/**
 * Upsert durable cursor.
 * last_processed_block = highest block whose effects are fully committed.
 * Does NOT apply startup rewind (runtime-only).
 */
export async function upsertCursor(
  supabase: WorkerSupabase,
  input: {
    streamName: CursorStreamName;
    chainId: number;
    lastProcessedBlock: number;
  },
): Promise<CursorRow> {
  const { data, error } = await supabase
    .from("chain_cursors")
    .upsert(
      {
        stream_name: input.streamName,
        chain_id: input.chainId,
        last_processed_block: input.lastProcessedBlock,
      },
      { onConflict: "stream_name,chain_id" },
    )
    .select("stream_name, chain_id, last_processed_block")
    .single();

  if (error) {
    throw new Error(
      `[4663-worker] upsertCursor(${input.streamName}) failed: ${error.message}`,
    );
  }

  return mapCursor(data as CursorDbRow);
}

/** Highest durable last_processed_block across known streams, or null if none exist. */
export function highestLastProcessedBlock(
  cursors: Map<CursorStreamName, CursorRow | null>,
): number | null {
  let max: number | null = null;
  for (const row of cursors.values()) {
    if (!row) continue;
    if (max === null || row.lastProcessedBlock > max) {
      max = row.lastProcessedBlock;
    }
  }
  return max;
}
