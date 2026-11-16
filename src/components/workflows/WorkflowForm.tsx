import type { InputField } from "@/lib/workflows/schema";

const FIELD =
  "w-full px-3 py-2 rounded-lg border border-input bg-surface text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all";

/** Formulaire généré à partir des champs déclarés dans la définition. */
export function WorkflowForm({
  fields,
  values,
  errors,
  onChange,
  disabled,
  idPrefix = "wf",
}: {
  fields: InputField[];
  values: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  if (fields.length === 0)
    return <p className="text-sm text-muted-foreground">Ce workflow ne demande aucune donnée.</p>;
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const err = errors[f.key];
        const common = {
          id,
          disabled,
          "aria-invalid": !!err,
          "aria-describedby": err ? `${id}-err` : f.help ? `${id}-help` : undefined,
        };
        const v = values[f.key];
        return (
          <div key={f.key}>
            {f.type !== "boolean" && (
              <label htmlFor={id} className="text-xs font-medium text-foreground mb-1.5 block">
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </label>
            )}
            {f.type === "textarea" ? (
              <textarea
                {...common}
                rows={5}
                maxLength={f.maxLength}
                value={String(v ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={`${FIELD} resize-y min-h-[6rem]`}
              />
            ) : f.type === "select" ? (
              <select
                {...common}
                value={String(v ?? "")}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={FIELD}
              >
                <option value="">— Choisir —</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <label htmlFor={id} className="flex items-center gap-2 text-sm">
                <input
                  {...common}
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => onChange(f.key, e.target.checked)}
                />
                {f.label}
              </label>
            ) : (
              <input
                {...common}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                min={f.min}
                max={f.max}
                maxLength={f.maxLength}
                step="any"
                value={String(v ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={FIELD}
              />
            )}
            {f.help && !err && (
              <p id={`${id}-help`} className="mt-1 text-[0.7rem] text-muted-foreground">
                {f.help}
              </p>
            )}
            {err && (
              <p id={`${id}-err`} className="mt-1 text-[0.7rem] text-destructive">
                {err}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
