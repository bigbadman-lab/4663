/**
 * TOKEN preview API types + client-facing error copy.
 * Snapshot sanitization lives in canvas-token (module-reusable domain).
 */

export const TOKEN_PREVIEW_API_PATH = "/api/social/token-preview" as const;

export type TokenPreviewErrorCode =
  | "invalid_json"
  | "invalid_input"
  | "invalid_address"
  | "not_a_contract"
  | "solana_not_enabled"
  | "url"
  | "timeout"
  | "unavailable"
  | "limit";

export type TokenPreviewClientError = TokenPreviewErrorCode;

export function tokenPreviewErrorMessage(
  error: TokenPreviewClientError,
): string {
  switch (error) {
    case "invalid_input":
      return "Paste a token address.";
    case "invalid_address":
      return "That is not a token address.";
    case "not_a_contract":
      return "That address is not a token contract.";
    case "solana_not_enabled":
      return "Solana tokens are not enabled yet.";
    case "url":
      return "Use LINK for URLs.";
    case "timeout":
      return "Token lookup timed out.";
    case "limit":
      return "TOKEN LIMIT REACHED · MAX 3";
    default:
      return "Could not look up that token.";
  }
}
