// Central plan definitions and limits.
// BETA MODE: all features unlocked for everyone, no plan gating.
// TODO: re-enable post-beta — restore original per-plan limits.

export type PlanId = "free" | "pro" | "max";

export interface PlanLimits {
  maxActiveProjects: number | null; // null = unlimited
  customBrandColor: boolean;
  csvExport: boolean;
  webhooks: boolean;
  removeBadge: boolean;
  customDomain: boolean;
  prioritySupport: boolean;
  dedicatedSupport: boolean;
}

// Beta: every plan is fully unlocked.
const BETA_UNLIMITED: PlanLimits = {
  maxActiveProjects: null,
  customBrandColor: true,
  csvExport: true,
  webhooks: true,
  removeBadge: true,
  customDomain: true,
  prioritySupport: true,
  dedicatedSupport: true,
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: BETA_UNLIMITED,
  pro: BETA_UNLIMITED,
  max: BETA_UNLIMITED,
};

export const DEFAULT_BRAND_COLOR = "#6366f1";

export function normalizePlan(plan: string | null | undefined): PlanId {
  return plan === "pro" || plan === "max" ? plan : "free";
}

export function getLimits(_plan: string | null | undefined): PlanLimits {
  // Beta mode: ignore plan, return unlimited.
  return BETA_UNLIMITED;
}

export const PLAN_LABEL: Record<PlanId, string> = {
  free: "Beta",
  pro: "Beta",
  max: "Beta",
};
