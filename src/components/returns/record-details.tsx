/** The labelled facts at the top of a record page. */
export function RecordDetails({ details }: { details: [string, string | null | undefined][] }) {
  const shown = details.filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
