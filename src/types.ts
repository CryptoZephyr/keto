export const IDENTITY_VERSION = 1;

export type EntityKind = "file" | "test";
export type DependencyKind = "imports" | "tests";

export type CoverageWarningType =
  | "dynamic_import"
  | "unresolved"
  | "parse_error"
  | "missing_file";

export interface CoverageWarning {
  type: CoverageWarningType;
  path: string;
  specifier?: string;
  detail: string;
}

export interface CodeEntity {
  id: number;
  stable_key: string;
  repository: string;
  path: string;
  kind: EntityKind;
  language: string;
  content_hash: string;
}

export interface DependsOnEdge {
  id: number;
  stable_key: string;
  source_id: number;
  destination_id: number;
  source_path: string;
  destination_path: string;
  kind: DependencyKind;
  specifier: string;
}

export interface ExtractResult {
  repository: string;
  identity_version: number;
  entities: CodeEntity[];
  relationships: DependsOnEdge[];
  warnings: CoverageWarning[];
}

export interface PathNode {
  id?: number;
  labels?: string[];
  properties: Record<string, unknown>;
}

export interface PathRelationship {
  id?: number;
  edge_type?: string;
  type?: string;
  src?: number;
  dst?: number;
  properties?: Record<string, unknown>;
}

export interface GraphPath {
  nodes: PathNode[];
  relationships?: PathRelationship[];
}

export type FallbackReason =
  | "changed_path_absent"
  | "parse_error"
  | "unresolved_import"
  | "dynamic_import"
  | "root_config"
  | "lockfile"
  | "test_config"
  | "shared_tooling"
  | "hydradb_unavailable"
  | "hydradb_timeout"
  | "hydradb_rejected"
  | "hydradb_budget"
  | "fixture_mismatch"
  | "empty_result_nontrivial"
  | "missing_file"
  | "query_limit"
  | "incomplete_coverage";

export interface FallbackReasonDetail {
  code: FallbackReason;
  detail: string;
}

export type HydraErrorKind =
  | "unavailable"
  | "timeout"
  | "rejected"
  | "budget";

export interface HydraError {
  kind: HydraErrorKind;
  message: string;
}

export interface FixtureComparison {
  match: boolean;
  missing: string[];
  unexpected: string[];
  detail: string;
}

export type RouterMode = "selected" | "full_suite";

export interface SelectedDecision {
  mode: "selected";
  tests: string[];
  reasons: FallbackReasonDetail[];
}

export interface FullSuiteDecision {
  mode: "full_suite";
  tests: string[];
  reasons: FallbackReasonDetail[];
}

export type SafetyDecision = SelectedDecision | FullSuiteDecision;

export interface AliasMap {
  [pattern: string]: string[];
}

export interface ImpactTest {
  path: string;
  paths: string[][];
}
