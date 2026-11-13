"use client";

import { useContext, useMemo, useState } from "react";
import { useApiQuery } from "@/hooks/use-api";
import { ApiContext } from "@/providers/app-context";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  buildPeerConnectionGroups,
  feignContract,
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
  projectId?: string | undefined;
  peerFilterId?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
}

function DockerInfraSection({ items }: { items: DockerOrInfraItem[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Container className="size-3.5 shrink-0" />
        <span>- Docker / Infrastructure &amp; Connectivity:</span>
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
                  <span className="font-mono text-[10px] text-muted-foreground">
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
          No direct Docker Compose declaration is available; this connection is recorded at code or API level.
        </p>
      )}
    </div>
  );
}

function CollapsibleServiceSnippet({
  serviceName,
  snippet,
}: {
  serviceName: string;
  snippet: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="text-left text-[11px] font-medium text-primary hover:underline"
      >
        {expanded ? `Hide snippet in ${serviceName}` : `Show snippet in ${serviceName}`}
      </button>
      {expanded && (
        <pre className="mt-1.5 max-h-40 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100">
          <code>{snippet}</code>
        </pre>
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
  const { t } = useLocale();
  const borderClass = isSubject
    ? "border-border border-l-2 border-l-primary/40 bg-muted/20"
    : "border-border bg-muted/20";
  const titleClass = "text-foreground";

  return (
    <div className={`rounded-lg border p-3 space-y-2.5 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1.5">
        <span className={`font-mono text-xs font-semibold ${titleClass}`}>
          {prefixLabel} ({isSubject ? t("Selected service") : t("Connected service")}):
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {items.length} {t("code reference(s)")}
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
                    variant="outline"
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
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Box className="size-3 shrink-0 text-foreground/70" />
                  <span>Class / Component in {serviceName}:</span>
                  <strong className="max-w-full break-words font-mono text-foreground">
                    {item.componentName}
                  </strong>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 break-all">
                  <FileCode className="size-3 shrink-0 text-foreground/70" />
                  <span>File &amp; Line:</span>
                  <code className="max-w-full whitespace-normal break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {item.file}
                    {item.line ? ` : line ${item.line}` : ""}
                  </code>
                </div>
              </div>

              {item.snippet ? (
                <CollapsibleServiceSnippet serviceName={serviceName} snippet={item.snippet} />
              ) : (
                <p className="text-[11px] italic text-muted-foreground">
                  {item.file.startsWith("(") ? "No source file or snippet is recorded for this reference." : <>Declaration location recorded: <span className="font-mono">{item.file}</span>; no source snippet is available.</>}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">
          No direct code snippet is recorded for {serviceName}; this connection is declared through configuration or Docker.
        </p>
      )}
    </div>
  );
}

function PeerPairAccordionItem({
  group,
  defaultOpen,
  onSelect,
}: {
  group: PeerServiceConnectionGroup;
  defaultOpen: boolean;
  onSelect?: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card transition-colors open:bg-card"
    >
      <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3.5 py-3 select-none hover:bg-muted/40 rounded-xl">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
            ▶
          </span>
          {/* CHỦ THỂ A LUÔN ĐỨNG TRƯỚC Ở BÊN TRÁI */}
          <span className="max-w-full shrink-0 break-words rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 font-mono text-xs font-medium text-foreground">
            {group.subjectName}
          </span>
          <span
            className="inline-flex items-center font-mono text-sm text-muted-foreground"
            title="Grouped relationships between two elements; calls in both directions are not implied"
          >
            <ArrowLeftRight className="size-4 mx-0.5" />
          </span>
          {/* ĐỐI TÁC B, C ĐỨNG SAU Ở BÊN PHẢI */}
          <span className="max-w-full shrink-0 break-words rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs font-medium text-foreground">
            {group.peerName}
          </span>
        </div>

        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          {group.protocols.slice(0, 3).map((proto) => (
            <Badge key={proto} variant="outline" className="font-mono text-[10px]">
              {proto}
            </Badge>
          ))}
          <Badge variant="secondary" className="font-mono text-[10px]">
            {group.edgeCount} {t("relationship(s)")}
          </Badge>
        </div>
      </summary>

      <div className="border-t border-border/60 px-3.5 py-3.5 space-y-3.5">
        {group.edges.some(edge => feignContract(edge)) && <details className="rounded-md border bg-muted/20 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Contract &amp; resolution details</summary>
          <div className="mt-3 space-y-3">{group.edges.map(edge => {
            const contract = feignContract(edge); if (!contract) return null;
            return <div key={edge.id} className="space-y-1.5 break-words">
              <p className="font-medium">{contract.title}</p>
              <p>Recorded source resolution: {contract.serverMatch === "MATCHED_METHOD_PATH" ? "Matching method + path" : contract.serverMatch === "AMBIGUOUS_ENDPOINT" ? "Ambiguous endpoint — no unique receiver established" : contract.serverMatch}.</p>
              <p>{contract.callSiteCount === null ? "Call-site count not established." : contract.callSiteCount > 0 ? `${contract.callSiteCount} typed call site${contract.callSiteCount === 1 ? "" : "s"} recorded in source metadata.` : "No unique call site recorded in source metadata."}</p>
              <p className="text-muted-foreground">{contract.limitation}</p>
              {onSelect && <button type="button" className="min-h-10 text-primary underline" onClick={() => onSelect(edge.id)}>Inspect relationship evidence</button>}
            </div>;
          })}</div>
        </details>}
        {/* MỤC CON 1: - Docker... */}
        <DockerInfraSection items={group.dockerAndInfraItems} />

        {/* MỤC CON 2: - Code: (+ A: ... / + B: ...) */}
        <div className="space-y-2.5 rounded-lg border border-border/70 bg-background/40 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Code2 className="size-4 text-primary shrink-0" />
            <span>Source evidence for both sides ({group.subjectName} ↔ {group.peerName}):</span>
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

function CommunicationPanelContent({
  model,
  selectedId,
  peerFilterId,
  onSelect,
}: {
  model: ArchitecturalModel;
  selectedId: string;
  peerFilterId?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const { t } = useLocale();
  let groups = buildPeerConnectionGroups(model, selectedId);
  if (peerFilterId) {
    const filtered = groups.filter((g) => g.peerId === peerFilterId);
    if (filtered.length > 0) {
      groups = filtered;
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        No external HTTP, Feign, Docker or messaging connections to other services are recorded for this element.
      </div>
    );
  }

  const subjectName = groups[0]?.subjectName ?? "Selected service";
  const isDirectEdge = model.edges.some((e) => e.id === selectedId);

  return (
    <div className="space-y-3" data-testid="communication-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <FolderGit2 className="size-4 text-primary shrink-0" />
          <span>
            {t("Connection evidence for")}{" "}
            <strong className="font-mono text-foreground">{subjectName}</strong>{" "}
            ({groups.length} {t("peer(s)")})
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {t("Select a pair")} <strong>{subjectName} ↔ ...</strong> {t("to inspect infrastructure and source evidence")}
        </span>
      </div>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <PeerPairAccordionItem
            key={group.pairKey}
            group={group}
            defaultOpen={Boolean(peerFilterId) || isDirectEdge || groups.length === 1}
            {...(onSelect ? {onSelect} : {})}
          />
        ))}
      </div>
    </div>
  );
}

function CommunicationPanelHydrated(props: CommunicationPanelProps) {
  const evidenceQuery = useApiQuery(
    "elementEvidenceContext",
    { modelId: props.model.id, elementId: props.selectedId ?? "" },
    { enabled: Boolean(props.projectId && props.model.id && props.selectedId) },
  );

  const modelWithHydratedEvidence = useMemo(() => {
    const relEvidence = evidenceQuery.data?.relationshipEvidence;
    if (!relEvidence || relEvidence.length === 0) {
      return props.model;
    }
    const evidenceMap = new Map<string, any[]>();
    for (const item of relEvidence) {
      const list = evidenceMap.get(item.relationshipId) ?? [];
      list.push(item.evidence);
      evidenceMap.set(item.relationshipId, list);
    }
    const updatedEdges = props.model.edges.map((edge) => {
      const hydrated = evidenceMap.get(edge.id);
      if (hydrated && (!edge.evidence || edge.evidence.length === 0)) {
        return {
          ...edge,
          evidence: hydrated,
        };
      }
      return edge;
    });
    return {
      ...props.model,
      edges: updatedEdges,
    };
  }, [props.model, evidenceQuery.data]);

  return (
    <CommunicationPanelContent
      model={modelWithHydratedEvidence}
      selectedId={props.selectedId!}
      peerFilterId={props.peerFilterId}
      onSelect={props.onSelect}
    />
  );
}

export function CommunicationPanel(props: CommunicationPanelProps) {
  if (!props.selectedId) {
    return null;
  }
  const api = useContext(ApiContext);
  if (!api || !props.projectId) {
    return (
      <CommunicationPanelContent
        model={props.model}
        selectedId={props.selectedId}
        peerFilterId={props.peerFilterId}
        onSelect={props.onSelect}
      />
    );
  }
  return <CommunicationPanelHydrated {...props} />;
}
