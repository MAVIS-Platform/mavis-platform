/**
 * Honest parity between the instant Sandbox builder and a real Live Docker session.
 *
 * Every Sandbox surface is listed here. A surface is REAL only when a real Docker
 * action or observed telemetry backs it. Simulated traffic, simulated hardware and
 * policy toggles stay Sandbox-only; Live must never present them as real evidence.
 */
export type LiveCapabilityState = "REAL" | "PREPARED" | "OBSERVE" | "UNAVAILABLE";

export type LiveCapability = {
  id: string;
  label: string;
  state: LiveCapabilityState;
  reason: string;
};

export type LiveCapabilityInput = {
  hasSession: boolean;
  hasTopology: boolean;
  hasTelemetry: boolean;
  canScale: boolean;
  hasMeasuredAction: boolean;
};

export function liveCapabilities(input: LiveCapabilityInput): LiveCapability[] {
  return [
    {
      id: "cluster-scenario",
      label: "Cluster Scenarios",
      state: "UNAVAILABLE",
      reason:
        "Live only runs the Lab's real GET/HEAD workload. Simulated cluster scenarios stay in Sandbox.",
    },
    {
      id: "prepared-block",
      label: "Block library",
      state: input.hasSession ? (input.hasTopology ? "PREPARED" : "REAL") : "UNAVAILABLE",
      reason: input.hasSession
        ? input.hasTopology
          ? "Only services declared in the pinned topology can be added or removed."
          : "No prepared topology. The list is the confirmed service scope; START and STOP still run real Docker commands."
        : "Start or select a Live Docker session to inspect its prepared blocks.",
    },
    {
      id: "custom-block",
      label: "Custom block",
      state: "UNAVAILABLE",
      reason:
        "Live cannot create a service that is not in the approved Compose profile and confirmed service mappings.",
    },
    {
      id: "service-actions",
      label: "Service Start/Stop/Clone",
      state: input.hasSession ? (input.hasTopology ? "PREPARED" : "REAL") : "UNAVAILABLE",
      reason: input.hasSession
        ? input.hasTopology
          ? "START and STOP target a prepared service; Clone requires canScale and stays at 8 or fewer replicas."
          : "START, STOP and SCALE target a confirmed service in the pinned session."
        : "Start or select a Live Docker session before sending a real command.",
    },
    {
      id: "replicas-1-8",
      label: "Replica presets 1–8",
      state: input.hasSession && input.canScale ? "REAL" : "UNAVAILABLE",
      reason: input.hasSession
        ? input.canScale
          ? "SCALE is sent to Docker and must be confirmed by Runner."
          : "This service is not marked canScale in the prepared topology."
        : "Start or select a Live Docker session before scaling replicas.",
    },
    {
      id: "replicas-16-32",
      label: "Replica presets 16 and 32",
      state: "UNAVAILABLE",
      reason: "BR-07 bounds a Live session to 8 replicas.",
    },
    {
      id: "delete-block",
      label: "Delete block",
      state: "UNAVAILABLE",
      reason:
        "Live keeps the prepared service definition so the student can add it again. Remove block sends STOP.",
    },
    {
      id: "hardware-stress",
      label: "Hardware & Stress Simulation",
      state: "UNAVAILABLE",
      reason:
        "CPU, RAM, traffic and lag are fixed by the approved execution profile. Live does not inject simulated stress.",
    },
    {
      id: "resilience-policy",
      label: "Resilience Policies",
      state: input.hasSession ? "OBSERVE" : "UNAVAILABLE",
      reason: input.hasSession
        ? "Policies belong to the curated repository. Live only reports observed circuit-breaker, retry, fallback or rate-limit evidence from real logs and spans."
        : "Start a Live Docker session to observe real resilience evidence.",
    },
    {
      id: "telemetry",
      label: "Service telemetry",
      state: input.hasTelemetry ? "OBSERVE" : "UNAVAILABLE",
      reason: input.hasTelemetry
        ? "CPU, memory, replicas, logs and spans come from the real Docker session."
        : "Wait for Runner telemetry before using observed values.",
    },
    {
      id: "load-capacity",
      label: "Load & capacity",
      state: input.hasMeasuredAction ? "OBSERVE" : "UNAVAILABLE",
      reason: input.hasMeasuredAction
        ? "Live reports measured request count, p95 and error rate from the real workload. It does not simulate demand or capacity."
        : "Run a confirmed START/STOP/SCALE action to measure the real workload.",
    },
    {
      id: "snapshots",
      label: "Snapshots",
      state: input.hasSession ? "REAL" : "UNAVAILABLE",
      reason: input.hasSession
        ? "A snapshot freezes the observed graph, telemetry and explanation under a SHA-256 digest."
        : "Start a Live Docker session to capture signed evidence.",
    },
    {
      id: "local-video",
      label: "Local video recording",
      state: "UNAVAILABLE",
      reason:
        "Live evidence is the signed snapshot and receipt path. Sandbox video remains a local-only artifact.",
    },
  ];
}

export function capabilitySummary(
  capabilities: readonly LiveCapability[],
): Record<LiveCapabilityState, number> {
  return capabilities.reduce(
    (summary, capability) => {
      summary[capability.state] += 1;
      return summary;
    },
    { REAL: 0, PREPARED: 0, OBSERVE: 0, UNAVAILABLE: 0 } as Record<LiveCapabilityState, number>,
  );
}
