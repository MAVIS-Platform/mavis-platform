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
      await save.mutateAsync({
        projectId,
        profileId: configuration.profileId,
        snapshotId: configuration.snapshotId ?? undefined,
        modelId: configuration.modelId ?? undefined,
        expectedRevision: configuration.revision,
        profile: { ...configuration.profile, studioTopology: compiled(topology) },
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
    <details className="rounded-lg border bg-card p-4" open>
      <summary className="cursor-pointer text-sm font-semibold">
        {t("Prepared Live blocks and connections", "Block và kết nối Live đã chuẩn bị")}
      </summary>
      <p className="my-2 text-xs leading-5 text-muted-foreground">
        {t(
          "Blocks must already exist in the approved Compose/profile and confirmed mappings. Each connection needs its own route-controller service in the call path.",
          "Block phải có sẵn trong Compose/profile đã duyệt và mapping đã xác nhận. Mỗi kết nối cần route-controller riêng trong đường gọi.",
        )}
      </p>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Blocks", "Block")}
          </h4>
          <Button type="button" size="sm" variant="outline" onClick={addBlock}>
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {t("Add block", "Thêm block")}
          </Button>
        </div>
        {topology.blocks.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("No blocks yet. Add services that the lecturer can Start/Stop/Scale.", "Chưa có block. Thêm service giảng viên có thể Start/Stop/Scale.")}
          </p>
        )}
        <ul className="space-y-2">
          {topology.blocks.map((block, index) => (
            <li key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_1.4fr_auto_auto_auto]">
              <label className="space-y-1 text-[11px] font-medium">
                <span>{t("Service", "Service")}</span>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={block.service}
                  onChange={(event) => updateBlock(index, { service: event.target.value, label: block.label || event.target.value })}
                >
                  <option value="">{t("Select service", "Chọn service")}</option>
                  {services.map((service) => <option key={service} value={service}>{service}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-[11px] font-medium">
                <span>{t("Label", "Nhãn")}</span>
                <Input value={block.label} onChange={(event) => updateBlock(index, { label: event.target.value })} />
              </label>
              <label className="flex items-end gap-1 pb-1 text-xs">
                <input type="checkbox" className="size-4 accent-primary" checked={block.canScale}
                  onChange={(event) => updateBlock(index, { canScale: event.target.checked })} />
                canScale
              </label>
              <label className="flex items-end gap-1 pb-1 text-xs">
                <input type="checkbox" className="size-4 accent-primary" checked={block.initiallyStopped}
                  onChange={(event) => updateBlock(index, { initiallyStopped: event.target.checked })} />
                {t("Initially stopped", "Dừng ban đầu")}
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeBlock(index)} aria-label={t("Remove block", "Xóa block")}>
                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Connections", "Kết nối")}
          </h4>
          <Button type="button" size="sm" variant="outline" onClick={addConnection}>
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {t("Add connection", "Thêm kết nối")}
          </Button>
        </div>
        {topology.connections.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("No connections yet. Add route-controller wires between prepared services.", "Chưa có kết nối. Thêm dây route-controller giữa các service đã chuẩn bị.")}
          </p>
        )}
        <ul className="space-y-2">
          {topology.connections.map((link, index) => (
            <li key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[0.9fr_0.9fr_1.2fr_13rem_auto]">
              <label className="space-y-1 text-[11px] font-medium">
                <span>{t("From", "Từ")}</span>
                <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={link.from}
                  onChange={(event) => updateConnection(index, { from: event.target.value })}>
                  <option value="">{t("Select service", "Chọn service")}</option>
                  {services.map((service) => <option key={service} value={service}>{service}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-[11px] font-medium">
                <span>{t("To", "Đến")}</span>
                <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={link.to}
                  onChange={(event) => updateConnection(index, { to: event.target.value })}>
                  <option value="">{t("Select service", "Chọn service")}</option>
                  {services.map((service) => <option key={service} value={service}>{service}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-[11px] font-medium">
                <span>{t("Route-controller service", "Service route-controller")}</span>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={link.controllerService}
                  onChange={(event) => updateConnection(index, { controllerService: event.target.value })}
                >
                  <option value="">{t("Select service", "Chọn service")}</option>
                  {Array.from(new Set([...services, ...(link.controllerService ? [link.controllerService] : [])])).map(
                    (service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="space-y-1 text-[11px] font-medium">
                <span>{t("Protocol", "Giao thức")}</span>
                <Input className="font-mono text-xs" value={link.protocol} onChange={(event) => updateConnection(index, { protocol: event.target.value })} />
              </label>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" className="size-4 accent-primary" checked={link.initiallyStopped}
                    onChange={(event) => updateConnection(index, { initiallyStopped: event.target.checked })} />
                  {t("Initially stopped", "Dừng ban đầu")}
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeConnection(index)} aria-label={t("Remove connection", "Xóa kết nối")}>
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="mt-3 rounded-md border bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-semibold">{t("Advanced JSON", "JSON nâng cao")}</summary>
        <pre className="mt-2 max-h-60 overflow-auto text-[11px] leading-5">{JSON.stringify(compiled(topology), null, 2)}</pre>
      </details>

      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-success">{message}</p>}
      <Button
        type="button"
        className="mt-3"
        size="sm"
        disabled={save.isPending || !configuration.snapshotId || !configuration.modelId}
        onClick={() => void saveTopology()}
      >
        {save.isPending ? t("Saving…", "Đang lưu…") : t("Save prepared topology", "Lưu topology Studio")}
      </Button>
    </details>
  );
}
