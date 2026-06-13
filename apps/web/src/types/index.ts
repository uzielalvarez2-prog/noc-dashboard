export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type IncidentStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type UserRole = "IDS" | "SUPERVISOR" | "ADMIN";
export type AlertTrigger =
  | "SLA_RISK"
  | "SLA_BREACHED"
  | "CRITICAL_OPEN"
  | "CRITICAL_UNASSIGNED";

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  assignedTo: string | null;
  slaDeadline: Date | string;
  slaBreached: boolean;
  slaRiskAt: Date | string | null;
  source: string;
  rawData: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
  syncedAt: Date | string;
}

export interface Operator {
  id: string;
  name: string;
  email: string;
  team: string;
  isOnShift: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date | string;
}

export interface AlertRule {
  id: string;
  name: string;
  trigger: AlertTrigger;
  channels: string[];
  recipients: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: Date | string;
}

export interface SLAMetrics {
  global: {
    compliance: number;
    total: number;
    breached: number;
    atRisk: number;
    resolved: number;
  };
  bySeverity: Record<
    Severity,
    { compliance: number; total: number; breached: number }
  >;
  trend: { hour: number; day: number; week: number };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastSync: string;
  };
}
