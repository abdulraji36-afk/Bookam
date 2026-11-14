"use client";

import { useState } from "react";

export type PickableUnit = {
  id: string;
  productId: string;
  locationId: string;
  serial: string;
  colour: string | null;
};

type Props = {
  lineKey: number;
  units: PickableUnit[];
  chosen: Set<string>;
  onToggle: (unitId: string) => void;
  unitWord: string;
};

const NO_COLOUR = "\u0000none";

/**
 * Choosing the exact serial-numbered units for an order line: first the
 * colour, then the serial number. Typing narrows the list by serial number.
 */
export function UnitPicker({ lineKey, units, chosen, onToggle, unitWord }: Props) {
  const [colour, setColour] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const colourKey = (unit: PickableUnit) => unit.colour ?? NO_COLOUR;
  const colours = [...new Set(units.map(colourKey))].sort((a, b) => a.localeCompare(b));
  const countOf = (key: string) => units.filter((unit) => colourKey(unit) === key).length;

  const needle = filter.trim().toLowerCase().replace(/\s/g, "");
  const shown = units.filter(
    (unit) =>
      (colour === null || colourKey(unit) === colour) && (!needle || unit.serial.toLowerCase().includes(needle))
  );

  if (units.length === 0) {
    return <p className="rounded-md bg-paper p-3 text-sm font-semibold text-danger">None in stock at this location.</p>;
  }

  return (
    <div className="space-y-3 rounded-md bg-paper p-3">
      {colours.length > 1 ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">1. Colour</legend>
          <div className="flex flex-wrap gap-2">
            {[null, ...colours].map((key) => {
              const isOn = colour === key;
              return (
                <button
                  key={key ?? "all"}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => setColour(key)}
                  className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold active:scale-[0.97] ${
                    isOn ? "border-ink bg-ink text-white" : "border-field bg-white text-ink hover:border-ink"
                  }`}
                >
                  {key === null ? "All" : key === NO_COLOUR ? "No colour" : key} ({key === null ? units.length : countOf(key)})
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-bold" htmlFor={`unit-filter-${lineKey}`}>
          {colours.length > 1 ? "2. " : ""}Serial number of each {unitWord} going out ({chosen.size} chosen)
        </label>
        {shown.length > 4 || needle ? (
          <input
            id={`unit-filter-${lineKey}`}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
            placeholder="Type or scan part of the serial number"
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
                  {unit.colour ? <span className="text-sm text-ink-soft">{unit.colour}</span> : null}
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-soft">
              {needle ? <>Nothing matches &ldquo;{filter}&rdquo;.</> : "None of this colour in stock."}
            </li>
          ) : null}
        </ul>
      </div>
      {/* Chosen units hidden by the colour or search filter must still be sent. */}
      {[...chosen]
        .filter((id) => !shown.some((unit) => unit.id === id))
        .map((id) => (
          <input key={id} type="hidden" name="unit" value={`${lineKey}|${id}`} />
        ))}
    </div>
  );
}
