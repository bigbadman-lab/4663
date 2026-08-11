/**
 * Canonical PONS factory definitions for the worker.
 * Operational addresses come from validated config (env → config → here).
 */

import type { FactoryVersion } from "@/lib/pons/types";
import type { Address } from "@/lib/pons/types";

export type PonsFactoryDefinition = {
  version: FactoryVersion;
  /** Lowercase 0x address */
  address: Address;
};

export function buildFactoryDefinitions(input: {
  factoryV1: Address;
  factoryV2: Address;
}): PonsFactoryDefinition[] {
  return [
    { version: "v1", address: input.factoryV1 },
    { version: "v2", address: input.factoryV2 },
  ];
}

export function factoryByAddress(
  factories: readonly PonsFactoryDefinition[],
  address: string,
): PonsFactoryDefinition | undefined {
  const key = address.toLowerCase();
  return factories.find((f) => f.address === key);
}
