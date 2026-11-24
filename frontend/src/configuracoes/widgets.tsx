import { useEffect, useId, useRef, type ReactNode } from "react";
import type { ConfigIssue } from "./types";

export function Block({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="cfg-block">
      <header className="cfg-block-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="cfg-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="cfg-empty">
      <strong>{title}</strong>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function IssueList({ issues }: { issues: ConfigIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="cfg-issues">
      {issues.map((issue) => (
        <li key={`${issue.severity}-${issue.message}`} data-severity={issue.severity}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function Tip({ text }: { text: string }) {
  return (
    <details className="cfg-tip">
      <summary>Ajuda</summary>
      <p>{text}</p>
    </details>
  );
}

export function TextField({
  label,
  value,
  onChange,
  help,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  disabled,
  spellCheck = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  type?: "text" | "password" | "search";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric";
  disabled?: boolean;
  spellCheck?: boolean;
}) {
  const id = useId();
  return (
    <div className="cfg-field">
      <div className="cfg-label-row">
        <label htmlFor={id}>{label}</label>
        {help ? <Tip text={help} /> : null}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        spellCheck={spellCheck}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  help,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="cfg-field">
      <div className="cfg-label-row">
        <label htmlFor={id}>{label}</label>
        {help ? <Tip text={help} /> : null}
      </div>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: string;
}) {
  return (
    <div className="cfg-field">
      <label className="cfg-toggle">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      {help ? <Tip text={help} /> : null}
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const field = ref.current?.querySelector<HTMLElement>("input, select, textarea");
    field?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="cfg-drawer-root">
      <button type="button" className="cfg-backdrop" aria-label="Fechar edição" onClick={onClose} />
      <aside ref={ref} className="cfg-drawer" role="dialog" aria-modal="true" aria-labelledby="cfg-drawer-title">
        <header className="cfg-block-head">
          <div>
            <h2 id="cfg-drawer-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="cfg-btn" onClick={onClose}>
            Fechar
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
