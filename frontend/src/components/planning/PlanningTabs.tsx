export type PlanningTabId = "acompanhamento" | "planejar" | "revisoes";

const TABS: { id: PlanningTabId; label: string }[] = [
  { id: "acompanhamento", label: "Acompanhamento" },
  { id: "planejar", label: "Planejar" },
  { id: "revisoes", label: "Revisões" },
];

export function PlanningTabs({
  active,
  onChange,
}: {
  active: PlanningTabId;
  onChange: (tab: PlanningTabId) => void;
}) {
  return (
    <nav className="plan-tabs" aria-label="Seções do planejamento">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? "is-active" : undefined}
          aria-current={active === tab.id ? "page" : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
