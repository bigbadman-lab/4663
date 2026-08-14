/**
 * Request the existing canvas ENTER modal without duplicating the form.
 */

export const OPEN_PARTICIPATION_ENTER_EVENT =
  "4663:open-participation-enter" as const;

export function requestParticipationEnter(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_PARTICIPATION_ENTER_EVENT));
}
