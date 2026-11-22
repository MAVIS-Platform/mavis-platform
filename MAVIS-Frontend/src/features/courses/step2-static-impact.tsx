"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, GitBranch, Layers } from "lucide-react";
import { DetailPanel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import {
  computeArchitectureImpact,
  type ImpactScopeMode,
  type UnaffectedElementEntry,
} from "@/lib/architecture/reverse-bfs";
import { useLocale } from "@/lib/i18n/locale-context";
import type { ArchitecturalModel } from "@/types/domain";

const ARCHITECTURAL_NODE_TYPES = new Set([
  "SERVICE_CONTAINER",
  "DATABASE",
  "QUEUE_BROKER",
  "MESSAGE_CHANNEL",
  "EXTERNAL_SYSTEM",
  "PERSON",
]);

function isFrameworkClassNoise(name: string): boolean {
  return /^(?:System|Microsoft)\./.test(name);
}

function isUnresolvedPlaceholder(name: string): boolean {
  return /^Unresolved\b/i.test(name.trim());
}

/**
 * Step 2 interactive Reverse BFS impact explorer and C1-C3 reference view back-links
 * grounded exclusively on the Lab's pinned static architectural model.
 */
export function Step2StaticImpact({
  projectId,
  modelId,
  modelQuery,
  sourceLink,
  inlineModel,
  waitForContext,
  onOpenC1C3View,
}: {
  projectId: string;
  modelId?: string | undefined;
  modelQuery: string | null;
  sourceLink: string;
  inlineModel?: ArchitecturalModel | undefined;
  waitForContext?: boolean | undefined;
  onOpenC1C3View?: ((view: "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH") => void) | undefined;
}) {
  const { t } = useLocale();
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [scope, setScope] = useState<ImpactScopeMode>("all");

  const modelQueryResult = useApiQuery(
    "model",
    { modelId: modelId ?? "", ...(projectId ? { projectId } : {}) },
    { enabled: !inlineModel && !waitForContext && Boolean(modelId) },
  );
  const model = inlineModel ?? modelQueryResult.data;

  const activeTargetId = useMemo(() => {
    if (!model || model.elements.length === 0) return "";
    if (selectedTargetId && model.elements.some((el) => el.id === selectedTargetId)) {
      return selectedTargetId;
    }
    const baseline = computeArchitectureImpact(model, model.elements[0]!.id, scope);
    const candidates = baseline.candidateTargets;
    let bestId = "";
    let bestScore = -1;
    for (const candidate of candidates) {
      if (isFrameworkClassNoise(candidate.name)) continue;
      const probe = computeArchitectureImpact(model, candidate.id, scope);
      const isArchitectural = ARCHITECTURAL_NODE_TYPES.has(candidate.elementType);
      const isPlaceholder = isUnresolvedPlaceholder(candidate.name);
      const tierBonus = isPlaceholder
        ? 100_000
        : candidate.elementType === "SERVICE_CONTAINER"
          ? 2_000_000
          : candidate.elementType === "DATABASE" ||
              candidate.elementType === "QUEUE_BROKER" ||
              candidate.elementType === "MESSAGE_CHANNEL"
            ? 1_000_000
            : isArchitectural
              ? 500_000
              : 0;
      const hasImpact = probe.upstreamImpacted.length > 0 ? 100_000 : 0;
      const score =
        tierBonus +
        hasImpact +
        probe.indirectImpactCount * 1000 +
        probe.directImpactCount * 50 +
        probe.upstreamImpacted.length * 10;
      if (score > bestScore) {
        bestScore = score;
        bestId = candidate.id;
      }
    }
    if (bestId && bestScore > 1) return bestId;
    const preferred =
      model.elements.find(
        (el) => el.elementType === "SERVICE_CONTAINER" && !isUnresolvedPlaceholder(el.name),
      ) ?? model.elements[0]!;
    return preferred.id;
  }, [model, selectedTargetId, scope]);

  const impact = useMemo(() => {
    if (!model || !activeTargetId) return null;
    return computeArchitectureImpact(model, activeTargetId, scope);
  }, [model, activeTargetId, scope]);

  const sortedCandidates = useMemo(() => {
    if (!impact) return [];
    const rank = (el: { name: string; elementType: string }) => {
      if (isFrameworkClassNoise(el.name)) return 3;
      if (isUnresolvedPlaceholder(el.name)) return 1;
      if (ARCHITECTURAL_NODE_TYPES.has(el.elementType)) return 0;
      return 2;
    };
    return [...impact.candidateTargets].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
  }, [impact]);

  const { architecturalUnaffected, lowLevelUnaffected } = useMemo(() => {
    const arch: UnaffectedElementEntry[] = [];
    const low: UnaffectedElementEntry[] = [];
    for (const item of impact?.unaffectedElements ?? []) {
      if (ARCHITECTURAL_NODE_TYPES.has(item.elementType) && !isFrameworkClassNoise(item.name)) {
        arch.push(item);
      } else {
        low.push(item);
      }
    }
    return { architecturalUnaffected: arch, lowLevelUnaffected: low };
  }, [impact]);

  const directCallers = useMemo(
    () => impact?.upstreamImpacted.filter((entry) => entry.distance === 1) ?? [],
    [impact],
  );
  const indirectCallers = useMemo(
    () => impact?.upstreamImpacted.filter((entry) => entry.distance > 1) ?? [],
    [impact],
  );
  const totalScopedNodes = impact
    ? Math.max(1, 1 + impact.upstreamImpacted.length + impact.unaffectedElements.length)
    : 1;
  const blastRadiusCount = impact?.blastRadiusCount ?? 1;
  const blastRadiusPercent = Math.min(100, Math.round((blastRadiusCount / totalScopedNodes) * 100));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <GitBranch className="size-4 text-primary" aria-hidden="true" />
            {t(
              "Reverse BFS Impact Simulator — Static impact check",
              "Mô phỏng lan truyền lỗi Reverse BFS — Kiểm tra tác động tĩnh",
            )}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Pick a service to trace upstream callers before completing the Course Roadmap Module Quiz and Runtime Studio.",
              "Chọn một service để xem các thành phần thượng nguồn bị ảnh hưởng trước khi làm Quiz và Runtime Studio.",
            )}
          </p>
        </div>
        {impact && (
          <Badge variant="outline" className="border-primary/30 bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
            {t("Blast Radius", "Bán kính ảnh hưởng")}: {blastRadiusCount}/{totalScopedNodes} ({blastRadiusPercent}%)
          </Badge>
        )}
      </div>

      {!onOpenC1C3View && (
        <DetailPanel
          title={t(
            "Reference Architecture Views (Back-Links)",
            "Sơ đồ kiến trúc tham chiếu (Liên kết nhanh)",
          )}
        >
          <div className="flex flex-wrap gap-2">
            {modelQuery ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/diagrams?${modelQuery}&kind=CONTEXT`}>C1 System Context</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/diagrams?${modelQuery}&kind=CONTAINER`}>C2 Container</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/diagrams?${modelQuery}&kind=COMPONENT`}>C3 Component</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/architecture?${modelQuery}`}>
                    {t("Service Dependency Graph", "Đồ thị phụ thuộc Service")}
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link
                    href={`/impact?${modelQuery}${activeTargetId ? `&target=${encodeURIComponent(activeTargetId)}` : ""}`}
                  >
                    {t("Full Change Impact", "Phân tích tác động đầy đủ")}
                    <ArrowRight />
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={sourceLink}>{t("Open Lab source", "Mở nguồn của Lab")}</Link>
              </Button>
            )}
          </div>
        </DetailPanel>
      )}

      {!modelId ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "Waiting for pinned static analysis model before running Reverse BFS.",
            "Đang chờ mô hình phân tích tĩnh được ghim để chạy Reverse BFS.",
          )}
        </p>
      ) : !model && (waitForContext || modelQueryResult.isPending) ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Loading architectural dependency graph…", "Đang tải đồ thị phụ thuộc kiến trúc…")}
        </p>
      ) : !impact ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "No architectural elements are available in this model yet.",
            "Mô hình này chưa có phần tử kiến trúc nào.",
          )}
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-foreground">
              <span>{t("Target element (if modified)", "Phần tử mục tiêu (nếu thay đổi)")}</span>
              <select
                aria-label="Target element for Reverse BFS"
                className="w-full rounded-lg border bg-card px-3 py-2 text-sm font-normal text-foreground"
                value={activeTargetId}
                onChange={(event) => {
                  setSelectedTargetId(event.target.value);
                }}
              >
                {sortedCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.elementType})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-foreground">
              <span>{t("Traversal granularity", "Phạm vi duyệt đồ thị")}</span>
              <select
                aria-label="Reverse BFS traversal scope"
                className="w-full rounded-lg border bg-card px-3 py-2 text-sm font-normal text-foreground"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as ImpactScopeMode);
                }}
              >
                <option value="all">
                  {t("All architectural nodes", "Tất cả nút kiến trúc")}
                </option>
                <option value="source">{t("Source code only", "Chỉ từ mã nguồn")}</option>
                <option value="components">
                  {t("Include internal components", "Bao gồm thành phần nội bộ")}
                </option>
              </select>
            </label>
          </div>

          {impact.cyclesDetected && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">
                  {t(
                    "Cycle Detected & Safely Terminated",
                    "Phát hiện phụ thuộc vòng & đã dừng an toàn",
                  )}
                </p>
                <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                  {t(
                    `Visited-node tracking prevented infinite traversal across cycle nodes: ${impact.cycleNodeNames.join(", ")}.`,
                    `Cơ chế đánh dấu nút đã thăm đã ngăn lặp vô hạn trên chu trình: ${impact.cycleNodeNames.join(", ")}.`,
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="grid divide-y rounded-lg border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Target service", "Dịch vụ mục tiêu")}
              </p>
              <p className="mt-1 truncate text-base font-bold text-foreground">{impact.targetName}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Direct callers (Hop 1)", "Gọi trực tiếp (Hop 1)")}
              </p>
              <p className="mt-1 tabular-nums text-xl font-bold text-foreground">{directCallers.length}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Indirect callers (Hop 2+)", "Ảnh hưởng gián tiếp (Hop 2+)")}
              </p>
              <p className="mt-1 tabular-nums text-xl font-bold text-foreground">{indirectCallers.length}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Unaffected / Isolated", "Không ảnh hưởng / Cô lập")}
              </p>
              <p className="mt-1 tabular-nums text-xl font-bold text-foreground">
                {impact.unaffectedElements.length}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({impact.isolatedCount} {t("isolated", "cô lập")})
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <GitBranch className="size-4 text-primary" aria-hidden="true" />
                {t(
                  "Impacted Upstream Chains (Reverse BFS)",
                  "Chuỗi ảnh hưởng ngược dòng (Reverse BFS)",
                )}
              </h4>
              {impact.upstreamImpacted.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "No upstream callers depend on this element within the selected scope.",
                    "Không có caller ngược dòng nào phụ thuộc vào phần tử này trong phạm vi đã chọn.",
                  )}
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {impact.upstreamImpacted.map((entry) => (
                    <li
                      key={entry.elementId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground">{entry.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          {entry.hops.join(" → ")}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          entry.distance === 1
                            ? "border-primary/30 bg-accent font-semibold text-primary"
                            : "border-border bg-muted font-medium text-foreground"
                        }
                      >
                        {entry.distance === 1
                          ? t("Direct · Hop 1", "Trực tiếp · Chặng 1")
                          : t(
                              `Indirect · Hop ${entry.distance}`,
                              `Gián tiếp · Chặng ${entry.distance}`,
                            )}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
                {t(
                  "Unaffected & Isolated Elements (Excluded from Blast Radius)",
                  "Phần tử không bị ảnh hưởng & cô lập (Loại khỏi vùng tác động)",
                )}
              </h4>
              {impact.unaffectedElements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "All other projected elements lie upstream of this target.",
                    "Tất cả phần tử khác đều nằm ở nhánh gọi ngược dòng.",
                  )}
                </p>
              ) : (
                <div className="space-y-2">
                  {architecturalUnaffected.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {architecturalUnaffected.map((item) => (
                        <Badge key={item.elementId} variant="secondary" className="font-medium text-foreground">
                          {item.name}
                          {item.isolated ? ` · ${t("Isolated", "Cô lập")}` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {lowLevelUnaffected.length > 0 && (
                    <details className="pt-1">
                      <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline">
                        {t(
                          `Show ${lowLevelUnaffected.length} code classes & framework types`,
                          `Xem thêm ${lowLevelUnaffected.length} lớp mã nguồn & kiểu framework`,
                        )}
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {lowLevelUnaffected.map((item) => (
                          <Badge key={item.elementId} variant="outline" className="font-normal text-foreground/85">
                            {item.name}
                            {item.isolated ? ` · ${t("Isolated", "Cô lập")}` : ""}
                          </Badge>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
