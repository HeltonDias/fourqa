import type { SyncSettingsView } from "../../api";
import type { ActiveConnection } from "../../auth/connectionStore";

export type ProjectProvider = "azure-devops";

export type ConnectedProject = {
  id: string;
  provider: ProjectProvider;
  name: string;
  organization: string;
  project: string;
  planId: number;
  planKey: string;
  active: boolean;
  roleLabel: string | null;
  connection: ActiveConnection | null;
};

export const PROVIDER_LABEL: Record<ProjectProvider, string> = {
  "azure-devops": "Azure DevOps",
};

/** Modo legado (login desligado): projetos vindos da configuração do ambiente. */
export function projectsFromSettings(settings: SyncSettingsView): ConnectedProject[] {
  return settings.plans.map((plan) => ({
    id: `${plan.planKey}-${plan.planId}`,
    provider: "azure-devops",
    name: plan.planName?.trim() || plan.planKey,
    organization: settings.organization,
    project: settings.project,
    planId: plan.planId,
    planKey: plan.planKey,
    active: plan.load,
    roleLabel: null,
    connection: null,
  }));
}

export function projectsFromConnections(connections: ActiveConnection[]): ConnectedProject[] {
  return connections.map((c) => ({
    id: String(c.id),
    provider: "azure-devops",
    name: c.title,
    organization: c.organization,
    project: c.project,
    planId: c.testPlanId,
    planKey: c.planKey,
    active: true,
    roleLabel: c.roleLabel,
    connection: c,
  }));
}
