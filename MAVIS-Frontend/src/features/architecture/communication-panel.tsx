"use client";

import {
  buildPeerConnectionGroups,
  type DockerOrInfraItem,
  type PeerServiceConnectionGroup,
  type SideCodeEvidenceItem,
} from "./communication-evidence";
import type { ArchitecturalModel } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeftRight,
  Box,
  Code2,
  Container,
  FileCode,
  FolderGit2,
} from "lucide-react";

export interface CommunicationPanelProps {
  model: ArchitecturalModel;
  selectedId: string | null;
  projectId?: string;
  onSelect?: (id: string) => void;
}

function DockerInfraSection({ items }: { items: DockerOrInfraItem[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
        <Container className="size-3.5 shrink-0" />
        <span>- Docker / Hạ tầng &amp; Công nghệ kết nối:</span>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2 pl-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-border/60 bg-background/80 p-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-foreground">{item.label}</span>
                {item.file && (
                  <span className="font-mono text-[10px] text-sky-400">
                    {item.file}
                    {item.line ? `:${item.line}` : ""}
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                {item.detail}
              </p>
              {item.snippet && item.category === "DOCKER_COMPOSE" && (
                <pre className="mt-1.5 max-h-28 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-200">
                  <code>{item.snippet}</code>
                </pre>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-4 text-[11px] italic text-muted-foreground">
          Không có khai báo Docker Compose trực tiếp (kết nối qua mức Code / API).
        </p>
      )}
    </div>
  );
}

function ServiceCodeSubtree({
  prefixLabel,
  serviceName,
  isSubject,
  items,
}: {
  prefixLabel: string;
  serviceName: string;
  isSubject: boolean;
  items: SideCodeEvidenceItem[];
}) {
  const borderClass = isSubject
    ? "border-amber-500/30 bg-amber-500/5"
    : "border-emerald-500/30 bg-emerald-500/5";
  const titleClass = isSubject ? "text-amber-400" : "text-emerald-400";

  return (
    <div className={`rounded-lg border p-3 space-y-2.5 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1.5">
        <span className={`font-mono text-xs font-bold ${titleClass}`}>
          {prefixLabel} ({isSubject ? "Chủ thể đang chọn" : "Service kết nối"}):
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {items.length} điểm chạm code
        </Badge>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="rounded-md border border-border/60 bg-background/90 p-2.5 text-xs space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={
                      item.direction === "OUTBOUND_TO_PEER" ? "warning" : "source"
                    }
                    className="text-[10px]"
                  >
                    {item.roleLabel}
                  </Badge>
                  {item.httpMethod && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                      {item.httpMethod}
                    </span>
                  )}
                  {item.apiPath && (
                    <span className="font-mono text-[11px] font-semibold text-foreground break-all">
                      {item.apiPath}
                    </span>
                  )}
                </div>
                {item.technology && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    [{item.technology}]
                  </span>
                )}
              </div>

              <div className="grid gap-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Box className="size-3 shrink-0 text-foreground/70" />
                  <span>Class / Component tại {serviceName}:</span>
                  <strong className="font-mono text-foreground">
                    {item.componentName}
                  </strong>
                </div>
                <div className="flex items-center gap-1.5 break-all">
                  <FileCode className="size-3 shrink-0 text-foreground/70" />
                  <span>File &amp; Dòng:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {item.file}
                    {item.line ? ` : dòng ${item.line}` : ""}
                  </code>
                </div>
              </div>

              {item.snippet ? (
                <div className="pt-1">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Code dẫn chứng tại {serviceName}:
                  </div>
                  <pre className="max-h-40 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100">
                    <code>{item.snippet}</code>
                  </pre>
                </div>
              ) : (
                <p className="text-[11px] italic text-muted-foreground">
                  (Đã xác định vị trí Class/Endpoint tại {serviceName}, xem file{" "}
                  <span className="font-mono">{item.file}</span>)
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">
          Chưa ghi nhận snippet code trực tiếp phía {serviceName} (kết nối khai báo qua cấu hình/Docker).
        </p>
      )}
    </div>
  );
}

function PeerPairAccordionItem({
  group,
  defaultOpen,
}: {
  group: PeerServiceConnectionGroup;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card/60 transition-all open:border-primary/40 open:bg-card open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 select-none hover:bg-muted/40 rounded-xl">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
            ▶
          </span>
          {/* CHỦ THỂ A LUÔN ĐỨNG TRƯỚC Ở BÊN TRÁI */}
          <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-300">
            {group.subjectName}
          </span>
          <span
            className="inline-flex items-center font-mono text-sm font-bold text-primary"
            title="Kết nối hai chiều / tương tác giữa 2 thành phần"
          >
            <ArrowLeftRight className="size-4 mx-0.5" />
          </span>
          {/* ĐỐI TÁC B, C ĐỨNG SAU Ở BÊN PHẢI */}
          <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
            {group.peerName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {group.protocols.slice(0, 3).map((proto) => (
            <Badge key={proto} variant="outline" className="font-mono text-[10px]">
              {proto}
            </Badge>
          ))}
          <Badge variant="secondary" className="font-mono text-[10px]">
            {group.edgeCount} kết nối
          </Badge>
        </div>
      </summary>

      <div className="border-t border-border/60 px-3.5 py-3.5 space-y-3.5">
        {/* MỤC CON 1: - Docker... */}
        <DockerInfraSection items={group.dockerAndInfraItems} />

        {/* MỤC CON 2: - Code: (+ A: ... / + B: ...) */}
        <div className="space-y-2.5 rounded-lg border border-border/70 bg-background/40 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Code2 className="size-4 text-primary shrink-0" />
            <span>- Code dẫn chứng 2 đầu ({group.subjectName} ↔ {group.peerName}):</span>
          </div>

          <div className="space-y-3 pl-2">
            {/* + A: CHỦ THỂ ĐÃ BẤM VÀO LUÔN ĐỨNG TRƯỚC */}
            <ServiceCodeSubtree
              prefixLabel={`+ ${group.subjectName}`}
              serviceName={group.subjectName}
              isSubject={true}
              items={group.subjectCodeItems}
            />

            {/* + B: ĐỐI TÁC KẾT NỐI ĐỨNG BÊN DƯỚI */}
            <ServiceCodeSubtree
              prefixLabel={`+ ${group.peerName}`}
              serviceName={group.peerName}
              isSubject={false}
              items={group.peerCodeItems}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

export function CommunicationPanel({
  model,
  selectedId,
  projectId: _projectId,
  onSelect: _onSelect,
}: CommunicationPanelProps) {
  if (!selectedId) {
    return null;
  }

  const groups = buildPeerConnectionGroups(model, selectedId);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        Thành phần này hiện không có kết nối ngoại vi (HTTP / Feign / Docker / Message Queue) sang các Service khác.
      </div>
    );
  }

  const subjectName = groups[0]?.subjectName ?? "Service đang chọn";
  const isDirectEdge = model.edges.some((e) => e.id === selectedId);

  return (
    <div className="space-y-3" data-testid="communication-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <FolderGit2 className="size-4 text-primary shrink-0" />
          <span>
            Dẫn chứng kết nối của chủ thể{" "}
            <strong className="font-mono text-amber-400">{subjectName}</strong>{" "}
            ({groups.length} đối tác)
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Bấm vào từng cặp <strong>{subjectName} ↔ ...</strong> để mở Docker &amp; Code
        </span>
      </div>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <PeerPairAccordionItem
            key={group.pairKey}
            group={group}
            defaultOpen={isDirectEdge || groups.length === 1}
          />
        ))}
      </div>
    </div>
  );
}
