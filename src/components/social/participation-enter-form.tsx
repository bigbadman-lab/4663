"use client";

/**
 * Compact 4663-native name entry for ephemeral participation.
 * Not an account/registration flow.
 */

import { useEffect, useId, useRef, useState } from "react";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/social/display-name";

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
      className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/25 p-4 sm:p-6"
      data-4663-participation-enter-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto w-full max-w-sm border border-neutral-300 bg-white px-5 py-5 text-neutral-900 shadow-sm sm:max-w-md sm:px-6 sm:py-6"
        data-4663-participation-enter-form
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
            className="font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
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
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="mt-1.5 w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-[13px] text-neutral-900 outline-none focus-visible:border-neutral-500"
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
            className="font-mono text-[11px] tracking-wide text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-participation-enter-submit
          >
            [ ENTER ]
          </button>
        </div>
      </div>
    </div>
  );
}
