import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

const CONTROL =
  "block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 " +
  "placeholder:text-slate-400 focus:border-brand-600 focus:outline-2 focus:outline-brand-600/30";

type FieldProps = { label: string; hint?: string; children: ReactNode; htmlFor: string };

export function Field({ label, hint, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; name: string };

export function TextField({ label, hint, id, name, ...props }: InputProps) {
  // Generated, so two forms on one page can both have a field called "name".
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <input id={inputId} name={name} className={CONTROL} {...props} />
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  name: string;
};

export function SelectField({ label, hint, id, name, children, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <Field label={label} hint={hint} htmlFor={selectId}>
      <select id={selectId} name={name} className={CONTROL} {...props}>
        {children}
      </select>
    </Field>
  );
}
