"use client";

/**
 * Round paper swatch — shared visual language for Lab object colours
 * and canvas tone shortcuts. Colour values stay in the caller’s palette.
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";

export const PAPER_COLOR_SWATCH_CLASS =
  "pointer-events-auto h-5 w-5 shrink-0 touch-manipulation rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400";

export type PaperColorSwatchProps = {
  background: string;
  border: string;
  selectedBorder: string;
  selected: boolean;
  ariaLabel: string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children" | "style" | "aria-label"
>;

export const PaperColorSwatch = forwardRef<
  HTMLButtonElement,
  PaperColorSwatchProps
>(function PaperColorSwatch(
  {
    background,
    border,
    selectedBorder,
    selected,
    ariaLabel,
    className,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      className={
        className
          ? `${PAPER_COLOR_SWATCH_CLASS} ${className}`
          : PAPER_COLOR_SWATCH_CLASS
      }
      style={{
        backgroundColor: background,
        borderColor: selected ? selectedBorder : border,
      }}
      {...rest}
    />
  );
});
