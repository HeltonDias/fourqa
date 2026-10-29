export function ReportTitles({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="report-titles">
      <h1>{title}</h1>
      <p className="report-subtitle">{subtitle}</p>
    </div>
  );
}
