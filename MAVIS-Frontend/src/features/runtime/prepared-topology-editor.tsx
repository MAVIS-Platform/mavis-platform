"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiMutation } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";

type Block = {
  service: string;
  label: string;
  canScale: boolean;
  initiallyStopped: boolean;
};
type Connection = {
  from: string;
  to: string;
  controllerService: string;
  protocol: string;
  initiallyStopped: boolean;
};
type Topology = { version: 1; blocks: Block[]; connections: Connection[] };

function readTopology(value: unknown): Topology {
  if (!value || typeof value !== "object") return { version: 1, blocks: [], connections: [] };
  const record = value as Record<string, unknown>;
  const rawBlocks = Array.isArray(record["blocks"]) ? record["blocks"] : [];
  const rawConnections = Array.isArray(record["connections"]) ? record["connections"] : [];
  const blocks = rawBlocks
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      service: String(item["service"] ?? ""),
      label: String(item["label"] ?? item["service"] ?? ""),
      canScale: item["canScale"] === true,
      initiallyStopped: item["initiallyStopped"] === true,
    }));
  const connections = rawConnections
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      from: String(item["from"] ?? ""),
      to: String(item["to"] ?? ""),
      controllerService: String(item["controllerService"] ?? ""),
      protocol: String(item["protocol"] ?? "HTTP"),
      initiallyStopped: item["initiallyStopped"] === true,
    }));
  return { version: 1, blocks, connections };
}

function compiled(topology: Topology) {
  return {
    version: 1,
    blocks: topology.blocks
      .filter((block) => block.service.trim())
      .map((block) => ({
        service: block.service.trim(),
        label: block.label.trim() || block.service.trim(),
        canScale: block.canScale,
        initiallyStopped: block.initiallyStopped,
      })),
    connections: topology.connections
      .filter((link) => link.from.trim() && link.to.trim() && link.controllerService.trim())
      .map((link) => ({
        from: link.from.trim(),
        to: link.to.trim(),
        controllerService: link.controllerService.trim(),
        protocol: link.protocol.trim() || "HTTP",
        initiallyStopped: link.initiallyStopped,
      })),
  };
}

export function PreparedTopologyEditor({ projectId, configuration, onSaved }: {
  projectId: string;
  configuration: Response<"runtimeConfiguration">;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const save = useApiMutation("saveRuntimeConfiguration");
  const [topology, setTopology] = useState<Topology>(() => readTopology(configuration.profile?.["studioTopology"]));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTopology(readTopology(configuration.profile?.["studioTopology"]));
  }, [configuration.revision, configuration.profile]);

  const applications =
    configuration.profile?.["applications"] && typeof configuration.profile["applications"] === "object"
      ? Object.keys(configuration.profile["applications"] as Record<string, unknown>)
      : [];
  const mappings =
    configuration.profile?.["serviceMappings"] && typeof configuration.profile["serviceMappings"] === "object"
      ? Object.keys(configuration.profile["serviceMappings"] as Record<string, unknown>)
      : [];
  const services = Array.from(new Set([
    ...applications,
    ...mappings,
    ...topology.blocks.map((block) => block.service),
    ...topology.connections.flatMap((link) => [link.from, link.to, link.controllerService]),
  ].filter(Boolean))).sort();

  const addBlock = () =>
    setTopology((current) => ({
      ...current,
      blocks: [...current.blocks, { service: services[0] ?? "", label: services[0] ?? "", canScale: false, initiallyStopped: false }],
    }));
  const updateBlock = (index: number, patch: Partial<Block>) =>
    setTopology((current) => ({
      ...current,
      blocks: current.blocks.map((block, position) => (position === index ? { ...block, ...patch } : block)),
    }));
  const removeBlock = (index: number) =>
    setTopology((current) => ({ ...current, blocks: current.blocks.filter((_, position) => position !== index) }));
  const addConnection = () =>
    setTopology((current) => ({
      ...current,
      connections: [...current.connections, {
        from: services[0] ?? "",
        to: services[1] ?? services[0] ?? "",
        controllerService: "",
        protocol: "HTTP",
        initiallyStopped: true,
      }],
    }));
  const updateConnection = (index: number, patch: Partial<Connection>) =>
    setTopology((current) => ({
      ...current,
      connections: current.connections.map((link, position) => (position === index ? { ...link, ...patch } : link)),
    }));
  const removeConnection = (index: number) =>
    setTopology((current) => ({ ...current, connections: current.connections.filter((_, position) => position !== index) }));

  const saveTopology = async () => {
    setError("");
    setMessage("");
    const blocks = topology.blocks.filter((block) => block.service.trim());
    if (blocks.length === 0) {
      setError(t("Add at least one prepared block before saving.", "Thêm ít nhất một block đã chuẩn bị trước khi lưu."));
      return;
    }
    const blockServices = new Set(blocks.map((block) => block.service.trim()));
    if (blockServices.size !== blocks.length) {
      setError(t("Each prepared block must use a unique service.", "Mỗi block phải dùng service duy nhất."));
      return;
    }
    for (const link of topology.connections) {
      if (!link.from.trim() || !link.to.trim() || !link.controllerService.trim()) {
        setError(t("Each connection needs from, to and a route-controller service.", "Mỗi kết nối cần from, to và route-controller."));
        return;
      }
      if (link.from.trim() === link.to.trim()) {
        setError(t("A connection cannot point to the same service.", "Kết nối không thể trỏ cùng một service."));
        return;
      }
    }
    try {
      const transientKeys = new Set([
        "detectedServices",
        "composeServices",
        "servicePorts",
        "serviceStacks",
        "detectedEndpoints",
        "databaseChecks",
        "requiredEnvVars",
        "runnerIssues",
        "infrastructureServices",
        "serviceHealthPaths",
        "serviceHealthConfidence",
        "serviceHealthReasons",
        "sandboxComposeYaml",
        "sandboxComposeChanges",
        "unresolvableRunnerIssues",
        "recommendedServiceMappings",
        "modelServiceNames",
        "localImageBuildAvailable",
        "configuredSecretKeys",
      ]);
      const baseProfile = Object.fromEntries(
        Object.entries(configuration.profile ?? {}).filter(([key]) => !transientKeys.has(key)),
      );
      await save.mutateAsync({
        projectId,
        profileId: configuration.profileId,
        snapshotId: configuration.snapshotId ?? undefined,
        modelId: configuration.modelId ?? undefined,
        expectedRevision: configuration.revision,
        profile: { ...baseProfile, studioTopology: compiled(topology) },
      });
      setMessage(t("Prepared topology saved.", "Đã lưu topology Studio."));
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : t(
              "Could not save the topology. Check the pinned service names, route-controller mappings and runtime configuration.",
              "Không lưu được topology. Kiểm tra service đã ghim, mapping route-controller và cấu hình runtime.",
            ),
      );
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Service blocks", "Khối dịch vụ")} ({topology.blocks.length})
          </h4>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={addBlock}>
            <Plus className="mr-1 size-3" aria-hidden="true" />
            {t("Add block", "Thêm block")}
          </Button>
        </div>
        {topology.blocks.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("No blocks yet. Add Compose services to expose in Studio Live.", "Chưa có block. Thêm service từ Compose để đưa lên Studio Live.")}
          </p>
        )}
        <ul className="space-y-1.5">
          {topology.blocks.map((block, index) => (
            <li
              key={index}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/15 px-2.5 py-2"
            >
              <select
                aria-label={t("Service", "Service")}
                className="h-8 min-w-36 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                value={block.service}
                onChange={(event) => updateBlock(index, { service: event.target.value, label: block.label || event.target.value })}
              >
                <option value="">{t("Select service", "Chọn service")}</option>
                {services.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
              <Input
                aria-label={t("Label", "Nhãn")}
                placeholder={t("Display label", "Tên hiển thị")}
                className="h-8 min-w-32 flex-1 text-xs"
                value={block.label}
                onChange={(event) => updateBlock(index, { label: event.target.value })}
              />
              <button
                type="button"
                aria-pressed={block.canScale}
                onClick={() => updateBlock(index, { canScale: !block.canScale })}
                className={`h-7 rounded-md border px-2 font-mono text-[10.5px] font-medium transition-colors ${
                  block.canScale
                    ? "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-200"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {block.canScale ? "Scalable" : "Fixed 1×"}
              </button>
              <button
                type="button"
                aria-pressed={block.initiallyStopped}
                onClick={() => updateBlock(index, { initiallyStopped: !block.initiallyStopped })}
                className={`h-7 rounded-md border px-2 font-mono text-[10.5px] font-medium transition-colors ${
                  block.initiallyStopped
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-200"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {block.initiallyStopped ? t("Starts Down", "Dừng sẵn") : t("Starts Up", "Chạy sẵn")}
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeBlock(index)}
                aria-label={t("Remove block", "Xóa block")}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Route-controller connections", "Kết nối route-controller")} ({topology.connections.length})
          </h4>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={addConnection}>
            <Plus className="mr-1 size-3" aria-hidden="true" />
            {t("Add connection", "Thêm kết nối")}
          </Button>
        </div>
        {topology.connections.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("No route-controller wires configured.", "Chưa cấu hình dây kết nối route-controller.")}
          </p>
        )}
        <ul className="space-y-1.5">
          {topology.connections.map((link, index) => (
            <li
              key={index}
              className="grid items-center gap-2 rounded-lg border border-border/70 bg-muted/15 p-2.5 sm:grid-cols-[1fr_1fr_1.1fr_5.5rem_auto]"
            >
              <select
                aria-label={t("From", "Từ")}
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                value={link.from}
                onChange={(event) => updateConnection(index, { from: event.target.value })}
              >
                <option value="">{t("From…", "Từ…")}</option>
                {services.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
              <select
                aria-label={t("To", "Đến")}
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                value={link.to}
                onChange={(event) => updateConnection(index, { to: event.target.value })}
              >
                <option value="">{t("To…", "Đến…")}</option>
                {services.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
              <select
                aria-label={t("Route-controller service", "Service route-controller")}
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                value={link.controllerService}
                onChange={(event) => updateConnection(index, { controllerService: event.target.value })}
              >
                <option value="">{t("Controller…", "Controller…")}</option>
                {Array.from(new Set([...services, ...(link.controllerService ? [link.controllerService] : [])])).map(
                  (service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ),
                )}
              </select>
              <Input
                aria-label={t("Protocol", "Giao thức")}
                className="h-8 font-mono text-xs"
                value={link.protocol}
                onChange={(event) => updateConnection(index, { protocol: event.target.value })}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  aria-pressed={link.initiallyStopped}
                  onClick={() => updateConnection(index, { initiallyStopped: !link.initiallyStopped })}
                  className={`h-7 whitespace-nowrap rounded-md border px-2 font-mono text-[10.5px] font-medium transition-colors ${
                    link.initiallyStopped
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-200"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.initiallyStopped ? t("Starts Cut", "Cắt sẵn") : t("Active", "Nối sẵn")}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeConnection(index)}
                  aria-label={t("Remove connection", "Xóa kết nối")}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
          {t("Advanced JSON", "JSON nâng cao")}
        </summary>
        <pre className="mt-2 max-h-52 overflow-auto font-mono text-[11px] leading-5 text-muted-foreground">
          {JSON.stringify(compiled(topology), null, 2)}
        </pre>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="text-xs">
          {error && <span role="alert" className="text-destructive">{error}</span>}
          {message && <span role="status" className="text-emerald-600 dark:text-emerald-300">{message}</span>}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={save.isPending || !configuration.snapshotId || !configuration.modelId}
          onClick={() => void saveTopology()}
        >
          {save.isPending ? t("Saving…", "Đang lưu…") : t("Save prepared topology", "Lưu topology Studio")}
        </Button>
      </div>
    </div>
  );
}
