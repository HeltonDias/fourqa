import { useState, type FormEvent } from "react";
import { api } from "../api";

type Props = {
  title: string;
  subtitle: string;
  onSaved: (v: { title: string; subtitle: string }) => void;
};

export function ReportTitles({ title, subtitle, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftSubtitle, setDraftSubtitle] = useState(subtitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setDraftTitle(title);
    setDraftSubtitle(subtitle);
    setError(null);
    setEditing(true);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) {
      setError("O título não pode ficar vazio.");
      return;
    }
    setSaving(true);
    setError(null);
    api
      .salvarCabecalho(draftTitle, draftSubtitle)
      .then((v) => {
        onSaved(v);
        setEditing(false);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  if (!editing) {
    return (
      <div className="report-titles">
        <div className="report-title-line">
          <h1>{title}</h1>
          <button type="button" className="title-edit-btn" onClick={open} title="Editar título e subtítulo">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </button>
        </div>
        <p className="report-subtitle">{subtitle}</p>
      </div>
    );
  }

  return (
    <form className="report-titles title-edit-form" onSubmit={submit}>
      <input
        className="title-edit-input is-title"
        value={draftTitle}
        maxLength={200}
        onChange={(e) => setDraftTitle(e.target.value)}
        placeholder="Título"
        autoFocus
      />
      <input
        className="title-edit-input"
        value={draftSubtitle}
        maxLength={300}
        onChange={(e) => setDraftSubtitle(e.target.value)}
        placeholder="Subtítulo"
      />
      <div className="title-edit-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="title-edit-cancel" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </button>
        {error && <span className="title-edit-error">{error}</span>}
      </div>
    </form>
  );
}
