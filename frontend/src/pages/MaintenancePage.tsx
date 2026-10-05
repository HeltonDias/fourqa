type Props = { title: string };

export function MaintenancePage({ title }: Props) {
  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <div className="maintenance-icon" aria-hidden>
          🛠
        </div>
        <h1>{title}</h1>
        <p>Esta tela está em manutenção. O foco atual é o <strong>Report</strong> (Home).</p>
        <p className="muted">Em breve espelharemos a mesma experiência da planilha nesta aba.</p>
      </div>
    </div>
  );
}
