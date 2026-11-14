"use client";

import { useState } from "react";
import { CONDITION_LABELS } from "@/lib/format";
import type { UnitCondition } from "@/types/database";

export type PickableUnit = {
  id: string;
  productId: string;
  locationId: string;
  serial: string;
  colour: string | null;
  condition: UnitCondition;
};

type Props = {
  lineKey: number;
  units: PickableUnit[];
  chosen: Set<string>;
  onToggle: (unitId: string) => void;
  unitWord: string;
};

/**
 * Choosing the exact serial-numbered units for an order line. Typing narrows
 * the list by serial number, colour or condition.
 */
export function UnitPicker({ lineKey, units, chosen, onToggle, unitWord }: Props) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase().replace(/\s/g, "");
  const shown = needle
    ? units.filter((unit) =>
        `${unit.serial}${unit.colour ?? ""}${CONDITION_LABELS[unit.condition]}`.toLowerCase().replace(/\s/g, "").includes(needle)
      )
    : units;

  if (units.length === 0) {
    return <p className="rounded-md bg-paper p-3 text-sm font-semibold text-danger">None in stock at this location.</p>;
  }

  return (
    <div className="space-y-2 rounded-md bg-paper p-3">
      <label className="block text-sm font-bold" htmlFor={`unit-filter-${lineKey}`}>
        Choose the {unitWord}s going out ({chosen.size} chosen)
      </label>
      {units.length > 4 ? (
        <input
          id={`unit-filter-${lineKey}`}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
          placeholder="Type a serial number, colour or condition"
          autoComplete="off"
          className="block min-h-11 w-full rounded-md border-2 border-field bg-white px-3 text-base font-medium placeholder:font-normal placeholder:text-ink-soft/70 focus:border-ink focus:outline-2 focus:outline-accent"
        />
      ) : null}
      <ul className="max-h-64 divide-y divide-line overflow-y-auto overscroll-contain rounded-md border-2 border-line bg-white">
        {shown.map((unit) => (
          <li key={unit.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                name="unit"
                value={`${lineKey}|${unit.id}`}
                checked={chosen.has(unit.id)}
                onChange={() => onToggle(unit.id)}
                className="size-5 shrink-0 accent-ink"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold tabular-nums">{unit.serial}</span>
                <span className="text-sm text-ink-soft">
                  {[unit.colour, CONDITION_LABELS[unit.condition]].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-3 text-sm text-ink-soft">Nothing matches &ldquo;{filter}&rdquo;.</li> : null}
      </ul>
      {/* Chosen units hidden by the filter must still be sent. */}
      {[...chosen]
        .filter((id) => !shown.some((unit) => unit.id === id))
        .map((id) => (
          <input key={id} type="hidden" name="unit" value={`${lineKey}|${id}`} />
        ))}
    </div>
  );
}
