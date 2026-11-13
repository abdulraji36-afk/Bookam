"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";

export type SearchOption = {
  value: string;
  label: string;
  /** Secondary text, such as a price or an area. */
  detail?: string;
  disabled?: boolean;
};

type Props = {
  label: string;
  name: string;
  options: SearchOption[];
  placeholder?: string;
  hint?: string;
  /** Uncontrolled starting value. */
  defaultValue?: string;
  /** Controlled value; pair it with onChange. */
  value?: string;
  onChange?: (value: string) => void;
};

/**
 * A dropdown you can type into. It behaves the same on every phone and
 * stays usable with hundreds of customers or products, where a plain
 * dropdown becomes a very long scroll.
 */
export function SearchSelect({ label, name, options, placeholder = "Type to search", hint, defaultValue = "", value, onChange }: Props) {
  const inputId = useId();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [inner, setInner] = useState(defaultValue);
  const [query, setQuery] = useState<string | null>(null); // null while not searching
  const [active, setActive] = useState(0);

  const selectedValue = value ?? inner;
  const selected = options.find((option) => option.value === selectedValue);
  const isOpen = query !== null;
  const needle = (query ?? "").trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(needle))
    : options;

  function choose(next: string) {
    if (value === undefined) setInner(next);
    onChange?.(next);
    setQuery(null);
  }

  function move(step: number) {
    if (matches.length === 0) return;
    let next = active;
    // Skip over entries that cannot be chosen.
    for (let tries = 0; tries < matches.length; tries++) {
      next = (next + step + matches.length) % matches.length;
      if (!matches[next].disabled) break;
    }
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      <input type="hidden" name={name} value={selectedValue} />
      <div className="relative">
        <input
          ref={input}
          id={inputId}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          value={query ?? selected?.label ?? ""}
          onFocus={() => {
            setQuery("");
            setActive(Math.max(0, options.findIndex((option) => option.value === selectedValue)));
          }}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          // Leaving without choosing keeps the earlier choice.
          onBlur={() => setQuery(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (isOpen) move(1);
              else setQuery("");
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter" && isOpen) {
              event.preventDefault();
              const option = matches[active];
              if (option && !option.disabled) {
                choose(option.value);
                input.current?.blur();
              }
            } else if (event.key === "Escape" && isOpen) {
              event.preventDefault();
              input.current?.blur();
            }
          }}
          className="block min-h-12 w-full rounded-md border-2 border-field bg-white pl-3 pr-10 text-base font-medium text-ink placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent"
        />
        <ChevronDown
          aria-hidden
          className={`pointer-events-none absolute right-3 top-1/2 size-[1.125rem] -translate-y-1/2 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </div>

      {isOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          // Bring the whole list into view, clear of the phone's bottom bar.
          ref={(node) => node?.scrollIntoView({ block: "nearest" })}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 scroll-mb-28 animate-pop-in md:scroll-mb-4 overflow-y-auto overscroll-contain rounded-md border-2 border-ink bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm font-medium text-ink-soft">Nothing matches &ldquo;{query}&rdquo;.</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === selectedValue}
                aria-disabled={option.disabled || undefined}
                // mousedown, not click: it fires before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (option.disabled) return;
                  choose(option.value);
                  input.current?.blur();
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex min-h-12 items-center justify-between gap-3 px-3 py-2 ${
                  option.disabled ? "cursor-not-allowed text-ink-soft/70" : "cursor-pointer"
                } ${index === active && !option.disabled ? "bg-paper" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{option.label}</span>
                  {option.detail ? <span className="block truncate text-sm text-ink-soft">{option.detail}</span> : null}
                </span>
                {option.value === selectedValue ? <Check aria-hidden className="size-5 shrink-0" strokeWidth={2.5} /> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
      {hint ? <p className="mt-1.5 text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}
