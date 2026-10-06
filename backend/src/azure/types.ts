/** Formatos mínimos das respostas da API REST do Azure DevOps usados pela sincronização. */

export interface AzureList<T> {
  value?: T[];
}

export interface IdentityRef {
  displayName?: string;
  uniqueName?: string;
  name?: string;
}

export interface ShallowReference {
  id?: number | string;
  name?: string;
  webUrl?: string;
}

export interface TestSuite {
  id?: number;
  name?: string;
  children?: TestSuite[];
}

export interface TestPoint {
  id?: number;
  state?: string;
  outcome?: string;
  lastUpdatedDate?: string;
  testCase?: ShallowReference;
  lastTestRun?: ShallowReference;
  lastResult?: ShallowReference;
  lastResultDetails?: { dateCompleted?: string; runBy?: IdentityRef };
  workItemProperties?: Array<{ workItem?: { key?: string; value?: unknown } }>;
}

export interface TestRun {
  id?: number;
}

export interface TestResult {
  id?: number;
  testPlan?: ShallowReference;
  testSuite?: ShallowReference;
  testPoint?: ShallowReference;
  testCase?: ShallowReference;
  configuration?: ShallowReference;
  associatedBugs?: ShallowReference[];
}

export interface WorkItemFieldDefinition {
  name?: string;
  referenceName?: string;
}

export interface WorkItem {
  id?: number;
  fields?: Record<string, unknown>;
}
