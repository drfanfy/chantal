/**
 * Kit d'interface du back-office : en-têtes, tableaux, champs, tiroir
 * d'édition large avec garde « modifications non enregistrées », badges.
 * Composants définis au niveau module (jamais dans un autre composant) pour
 * éviter les remontages et pertes de focus.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const INPUT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60";
export const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary/90`;
export const BTN_SECONDARY = `${BTN} border border-border bg-background hover:bg-muted`;
export const BTN_DANGER = `${BTN} border border-destructive/40 text-destructive hover:bg-destructive/10`;

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Rechercher…",
  label = "Rechercher",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 w-full sm:w-64">
      <Search className="w-3.5 h-3.5 text-muted-foreground" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none"
      />
      {value && (
        <button type="button" aria-label="Effacer" onClick={() => onChange("")}>
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  empty,
  onRowClick,
  error,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty: ReactNode;
  error?: string | null;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap",
                    c.hideOnMobile && "hidden md:table-cell",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
                  Chargement…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-destructive"
                >
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    onRowClick && "cursor-pointer hover:bg-muted/40 focus-within:bg-muted/40",
                  )}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-2.5 align-middle",
                        c.hideOnMobile && "hidden md:table-cell",
                        c.className,
                      )}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BADGE_TONES = {
  green: "bg-emerald-500/10 text-emerald-700",
  gray: "bg-muted text-muted-foreground",
  amber: "bg-amber-500/10 text-amber-700",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-blue-500/10 text-blue-700",
  violet: "bg-violet-500/10 text-violet-700",
} as const;
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "gray",
  children,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  help,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[0.7rem] text-destructive" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="mt-1 text-[0.7rem] text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  help,
  error,
  required,
  placeholder,
  type = "text",
  disabled,
  maxLength,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  maxLength?: number;
  mono?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} error={error} required={required} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLS, mono && "font-mono text-xs")}
      />
    </Field>
  );
}

/** Zone de texte large, redimensionnable, avec compteur — adaptée aux prompts longs. */
export function TextAreaField({
  label,
  value,
  onChange,
  help,
  error,
  required,
  placeholder,
  rows = 6,
  mono,
  maxLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      help={
        <span className="flex justify-between gap-2">
          <span>{help}</span>
          <span className="tabular-nums">
            {value.length}
            {maxLength ? ` / ${maxLength}` : ""}
          </span>
        </span>
      }
      error={error}
      required={required}
      htmlFor={id}
    >
      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          INPUT_CLS,
          "resize-y min-h-[5rem] leading-relaxed",
          mono && "font-mono text-xs",
        )}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  help,
  error,
  required,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} error={error} required={required} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={INPUT_CLS}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  help,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div>
        <label htmlFor={id} className={cn("text-sm", disabled && "text-muted-foreground")}>
          {label}
        </label>
        {help && <p className="text-[0.7rem] text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div
      className={cn("grid gap-4", cols === 2 && "md:grid-cols-2", cols === 3 && "md:grid-cols-3")}
    >
      {children}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Avertit avant fermeture de l'onglet si des modifications ne sont pas enregistrées. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [active]);
}

/**
 * Tiroir d'édition (pleine hauteur, jusqu'à 960 px de large, défilement interne,
 * en-tête et pied fixes). Fermeture protégée si `dirty`.
 */
export function EditorSheet({
  open,
  onClose,
  title,
  subtitle,
  dirty,
  children,
  footer,
  wide = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  dirty?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  useBeforeUnload(!!open && !!dirty);
  const requestClose = () => (dirty ? setConfirm(true) : onClose());
  return (
    <>
      <SheetPrimitive.Root open={open} onOpenChange={(o) => !o && requestClose()}>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <SheetPrimitive.Content
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-background shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
              wide ? "sm:max-w-[960px]" : "sm:max-w-xl",
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <SheetPrimitive.Title className="text-base font-semibold truncate">
                  {title}
                </SheetPrimitive.Title>
                {subtitle ? (
                  <SheetPrimitive.Description asChild>
                    <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
                  </SheetPrimitive.Description>
                ) : (
                  <SheetPrimitive.Description className="sr-only">
                    Formulaire d'édition
                  </SheetPrimitive.Description>
                )}
              </div>
              <div className="flex items-center gap-2">
                {dirty && <Badge tone="amber">Modifications non enregistrées</Badge>}
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Fermer"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
                {footer}
              </div>
            )}
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      </SheetPrimitive.Root>
      <ConfirmDialog
        open={confirm}
        title="Abandonner les modifications ?"
        description="Les modifications non enregistrées seront perdues."
        confirmLabel="Abandonner"
        danger
        onConfirm={() => {
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  danger,
  onConfirm,
  onCancel,
  busy,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-2">{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={
              danger
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Suit l'état « modifié » d'un formulaire par comparaison JSON avec la valeur initiale. */
export function useDirtyForm<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const base = useRef(JSON.stringify(initial));
  const reset = (v: T) => {
    base.current = JSON.stringify(v);
    setValue(v);
  };
  const dirty = JSON.stringify(value) !== base.current;
  const patch = (p: Partial<T>) => setValue((s) => ({ ...s, ...p }));
  return { value, setValue, patch, dirty, reset };
}

export function formatDate(s: string | null | undefined, withTime = true): string {
  if (!s) return "—";
  return new Date(s).toLocaleString(
    "fr-FR",
    withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" },
  );
}

export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export const ROLE_OPTIONS = [
  { value: "viewer", label: "Lecteur (viewer)" },
  { value: "beta_tester", label: "Bêta-testeur" },
  { value: "admin", label: "Administrateur" },
  { value: "super_admin", label: "Super administrateur" },
] as const;
