/**
 * Topic / data-word address helpers.
 * Ported semantics from pons-data-lab build-launch-registry.ts.
 */

import { getAddress, zeroAddress, type Hex } from "viem";
import { normalizeAddress } from "@/lib/worker/normalize";

export function isAddressShaped(topic: string): boolean {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) return false;
  return topic.slice(2, 26).toLowerCase() === "0".repeat(24);
}

export function topicToAddress(topic: string): string {
  return normalizeAddress(getAddress(`0x${topic.slice(-40)}`));
}

export function extractDataWords(data: string): string[] {
  if (!data || data === "0x") return [];
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const words = Math.floor(hex.length / 64);
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    const word = (`0x${hex.slice(i * 64, i * 64 + 64)}`) as Hex;
    if (!isAddressShaped(word)) continue;
    const addr = topicToAddress(word);
    if (addr !== zeroAddress.toLowerCase()) out.push(addr);
  }
  return out;
}

export function extractDataWordAt(data: string, index: number): string | null {
  if (!data || data === "0x") return null;
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < (index + 1) * 64) return null;
  const word = (`0x${hex.slice(index * 64, index * 64 + 64)}`) as Hex;
  if (!isAddressShaped(word)) return null;
  const addr = topicToAddress(word);
  if (addr === zeroAddress.toLowerCase()) return null;
  return addr;
}

export function bytecodeSize(code: string | null | undefined): number {
  if (!code || code === "0x" || code === "0x0") return 0;
  return Math.floor((code.length - 2) / 2);
}
