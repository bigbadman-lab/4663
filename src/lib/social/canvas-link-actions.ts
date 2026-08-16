/**
 * LINK creation permission — named participants compose; guests open ENTER.
 * Reuses the existing participation modal. Do not add a LINK-specific sign-in.
 */

import { requestParticipationEnter } from "@/lib/social/request-participation-enter";

export function beginLinkIfNamed(input: {
  isNamedParticipant: boolean;
  onOpen: () => void;
  requestEnter?: () => void;
}): "compose" | "enter" {
  if (!input.isNamedParticipant) {
    (input.requestEnter ?? requestParticipationEnter)();
    return "enter";
  }
  input.onOpen();
  return "compose";
}
