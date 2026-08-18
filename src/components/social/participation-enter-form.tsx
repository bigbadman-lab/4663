"use client";

/**
 * Compact 4663-native name entry for ephemeral participation.
 * Not an account/registration flow.
 * Mobile: viewport-bounded panel + internal scroll (8A.11); desktop unchanged.
 */

import { useEffect, useId, useRef, useState } from "react";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/social/display-name";
import { recordTapDebug } from "@/lib/canvas/tap-debug";

type ParticipationEnterFormProps = {
  onClose: () => void;
  onEnter: (
    displayName: string,
  ) => { ok: true } | { ok: false; error: string };
};

export function ParticipationEnterForm({
  onClose,
  onEnter,
}: ParticipationEnterFormProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    inputRef.current?.focus();
    const input = inputRef.current;
    const rect = input?.getBoundingClientRect();
    recordTapDebug("form", "form-mounted", {
      target: "ParticipationEnterForm",
      path: `input=${input ? "yes" : "no"} active=${
        document.activeElement === input ? "yes" : "no"
      } rect=${
        rect
          ? `${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`
          : "none"
      } z=30`,
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  const submit = () => {
    const result = onEnter(name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto overscroll-none bg-neutral-900/25 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] sm:p-6"
      data-4663-participation-enter-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={(event) => {
        // Keep canvas pan / empty-create from seeing through the overlay.
        event.stopPropagation();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain border border-neutral-300 bg-white px-4 py-4 text-neutral-900 shadow-sm sm:max-h-none sm:max-w-md sm:overflow-visible sm:px-6 sm:py-6"
        data-4663-participation-enter-form
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-semibold tracking-tight"
          >
            Enter
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            aria-label="Close"
            data-4663-participation-enter-close
          >
            [ CLOSE ]
          </button>
        </div>

        <p className="mb-4 font-mono text-[12px] leading-relaxed tracking-wide text-neutral-600 sm:text-[13px]">
          Choose a temporary name for this session. Not an account.
        </p>

        <label className="block font-mono text-[11px] tracking-wide text-neutral-500">
          Name
          <input
            ref={inputRef}
            type="text"
            value={name}
            maxLength={DISPLAY_NAME_MAX_LENGTH + 8}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            onFocus={() => {
              // Keep field in view when the software keyboard shrinks the visual viewport.
              requestAnimationFrame(() => {
                inputRef.current?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="mt-1.5 w-full border border-neutral-300 bg-white px-3 py-2.5 font-mono text-base text-neutral-900 outline-none focus-visible:border-neutral-500 sm:py-2 sm:text-[13px]"
            data-4663-participation-name-input
          />
        </label>

        {error ? (
          <p
            className="mt-2 font-mono text-[11px] tracking-wide text-rose-600"
            data-4663-participation-name-error
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={submit}
            className="inline-flex min-h-11 items-center font-mono text-[11px] tracking-wide text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-participation-enter-submit
          >
            [ ENTER ]
          </button>
        </div>
      </div>
    </div>
  );
}
