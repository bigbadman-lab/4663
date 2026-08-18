/**
 * TOKEN creation permission — named participants compose; guests open ENTER.
 * Same gating as LINK. Do not add a TOKEN-specific sign-in.
 */

import { requestParticipationEnter } from "@/lib/social/request-participation-enter";

export function beginTokenIfNamed(input: {
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
