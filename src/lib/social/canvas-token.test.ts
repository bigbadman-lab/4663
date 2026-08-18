/**
 * Canvas TOKEN persistence — snapshot at place time, max 3 per owner.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANVAS_TOKEN_MAX_PER_OWNER,
  canPlaceCanvasToken,
  commitCanvasTokenPublish,
  countCanvasTokensForOwner,
  createCanvasTokenObject,
  formatCanvasTokenAddress,
  normalizeCanvasTokenObject,
  normalizeResolvedCanvasToken,
  playhtmlTokenElementId,
  removeCanvasToken,
  retainCanvasTokensForPresentOwners,
  type ResolvedCanvasToken,
} from "@/lib/social/canvas-token";

const OWNER_A = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TOKEN_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ADDR = "0xABCDEF0123456789ABCDEF0123456789ABCDEF01";
const SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const PREVIEW: ResolvedCanvasToken = {
  chain: "robinhood",
  address: ADDR.toLowerCase(),
  name: "Example Token",
  symbol: "EX",
  decimals: 18,
  explorerUrl: "https://robinhoodchain.blockscout.com/token/0xabcdef0123456789abcdef0123456789abcdef01",
  sourceLabel: "ROBINHOOD",
};

function placed(id: string, owner = OWNER_A, preview: ResolvedCanvasToken = PREVIEW) {
  const created = createCanvasTokenObject({
    preview,
    ownerSessionId: owner,
    leftPct: 40,
    topPct: 50,
    randomUUID: () => id,
    now: () => new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("create failed");
  return created.token;
}

describe("Canvas TOKEN persistence", () => {
  it("persists a normalized metadata snapshot", () => {
    const token = placed(TOKEN_A);
    assert.equal(token.chain, "robinhood");
    assert.equal(token.address, ADDR.toLowerCase());
    assert.equal(token.symbol, "EX");
    assert.equal(token.sourceLabel, "ROBINHOOD");
    assert.equal(token.ownerSessionId, OWNER_A);
    assert.equal(playhtmlTokenElementId(token.tokenId), `4663-token-${TOKEN_A}`);
    const roundTrip = normalizeCanvasTokenObject({
      ...token,
      name: "  Example Token  ",
      extraFutureField: true,
    });
    assert.equal(roundTrip?.name, "Example Token");
    assert.equal(roundTrip?.address, ADDR.toLowerCase());
  });

  it("allows incomplete metadata when address + explorer exist", () => {
    const created = createCanvasTokenObject({
      preview: {
        chain: "robinhood",
        address: ADDR,
        explorerUrl: PREVIEW.explorerUrl,
        sourceLabel: "ROBINHOOD",
      },
      ownerSessionId: OWNER_A,
      leftPct: 10,
      topPct: 10,
      randomUUID: () => TOKEN_A,
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.token.name, undefined);
    assert.equal(created.token.symbol, undefined);
    assert.equal(created.token.imageUrl, undefined);
  });

  it("preserves Solana address casing on round trip", () => {
    const preview = normalizeResolvedCanvasToken({
      chain: "solana",
      address: SOLANA,
      explorerUrl: "https://explorer.solana.com/address/" + SOLANA,
      sourceLabel: "SOLANA",
    });
    assert.ok(preview);
    assert.equal(preview?.address, SOLANA);
    const token = placed(TOKEN_A, OWNER_A, preview!);
    const roundTrip = normalizeCanvasTokenObject(token);
    assert.equal(roundTrip?.chain, "solana");
    assert.equal(roundTrip?.address, SOLANA);
    assert.equal(formatCanvasTokenAddress(roundTrip!), "EPjF…Dt1v");
  });

  it("drops invalid rows including unknown chain and bad explorer", () => {
    assert.equal(normalizeCanvasTokenObject(null), null);
    assert.equal(
      normalizeCanvasTokenObject({
        ...placed(TOKEN_A),
        chain: "evm",
      }),
      null,
    );
    assert.equal(
      normalizeCanvasTokenObject({
        ...placed(TOKEN_A),
        explorerUrl: "javascript:alert(1)",
      }),
      null,
    );
  });

  it("participant can place tokens below the max", () => {
    let data = { tokens: [] as ReturnType<typeof placed>[] };
    for (let i = 0; i < CANVAS_TOKEN_MAX_PER_OWNER; i += 1) {
      const id = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`;
      const committed = commitCanvasTokenPublish({
        previous: data,
        token: placed(id),
        ready: true,
      });
      assert.equal(committed.ok, true);
      if (!committed.ok) return;
      data = committed.pageData;
    }
    assert.equal(countCanvasTokensForOwner(data, OWNER_A), 3);
    assert.equal(canPlaceCanvasToken(data, OWNER_A), false);
  });

  it("fourth active token is rejected", () => {
    const tokens = [0, 1, 2].map((i) =>
      placed(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`),
    );
    const fourth = placed("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const committed = commitCanvasTokenPublish({
      previous: { tokens },
      token: fourth,
      ready: true,
    });
    assert.equal(committed.ok, false);
    if (committed.ok) return;
    assert.equal(committed.reason, "limit");
  });

  it("owner delete frees a slot", () => {
    const tokens = [0, 1, 2].map((i) =>
      placed(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`),
    );
    const next = removeCanvasToken({ tokens }, tokens[0].tokenId);
    assert.equal(canPlaceCanvasToken(next, OWNER_A), true);
  });

  it("LEAVE/RESET style owner removal and presence retain drop owned tokens", () => {
    const mine = placed(TOKEN_A, OWNER_A);
    const theirs = placed("cccccccc-cccc-4ccc-8ccc-cccccccccccc", OWNER_B);
    const next = retainCanvasTokensForPresentOwners(
      { tokens: [mine, theirs] },
      new Set([OWNER_A]),
    );
    assert.deepEqual(
      next.tokens.map((token) => token.tokenId),
      [TOKEN_A],
    );
  });
});
