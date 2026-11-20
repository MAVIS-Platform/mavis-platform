"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, GitBranch, Layers } from "lucide-react";
import { DetailPanel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { computeArchitectureImpact, type ImpactScopeMode } from "@/lib/architecture/reverse-bfs";
import { useLocale } from "@/lib/i18n/locale-context";
import type { ArchitecturalModel } from "@/types/domain";

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
  onOpenC1C3View,
}: {
  projectId: string;
  modelId?: string | undefined;
  modelQuery: string | null;
  sourceLink: string;
  inlineModel?: ArchitecturalModel | undefined;
  onOpenC1C3View?: ((view: "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH") => void) | undefined;
}) {
  const { t } = useLocale();
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [scope, setScope] = useState<ImpactScopeMode>("all");
  const [demoLeafActive, setDemoLeafActive] = useState(false);

  const modelQueryResult = useApiQuery(
    "model",
    { modelId: modelId ?? "", ...(projectId ? { projectId } : {}) },
    { enabled: !inlineModel && Boolean(modelId) },
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
      const probe = computeArchitectureImpact(model, candidate.id, scope);
      const isDownstreamType =
        candidate.elementType === "SERVICE_CONTAINER" || candidate.elementType === "DATABASE" ? 1 : 0;
      const score =
        probe.indirectImpactCount * 1000 +
        probe.directImpactCount * 50 +
        probe.upstreamImpacted.length * 10 +
        isDownstreamType;
      if (score > bestScore) {
        bestScore = score;
        bestId = candidate.id;
      }
    }
    if (bestId && bestScore > 1) return bestId;
    const preferred =
      model.elements.find((el) => el.elementType === "SERVICE_CONTAINER") ?? model.elements[0]!;
    return preferred.id;
  }, [model, selectedTargetId, scope]);

  const impact = useMemo(() => {
    if (!model || !activeTargetId) return null;
    return computeArchitectureImpact(model, activeTargetId, scope);
  }, [model, activeTargetId, scope]);

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
  const blastRadiusCount = demoLeafActive ? 1 : (impact?.blastRadiusCount ?? 1);
  const blastRadiusPercent = Math.min(100, Math.round((blastRadiusCount / totalScopedNodes) * 100));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-950">
            <GitBranch className="size-4 text-teal-600" />
            <span>
              {t(
                "Reverse BFS Impact Simulator — How to complete Step 2",
                "Mô phỏng lan truyền lỗi Reverse BFS — Hướng dẫn thực hiện Bước 2",
              )}
            </span>
          </div>
          <Badge variant="outline" className="border-teal-300 bg-white text-teal-700">
            {t("3 quick steps", "3 bước thực hành")}
          </Badge>
        </div>
        <ol className="mt-3 grid gap-2 text-xs leading-5 text-slate-700 md:grid-cols-3">
          <li className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2">
            <span className="font-semibold text-teal-800">
              {t("1. Pick a target service:", "1. Chọn node đích (Service/DB):")}
            </span>{" "}
            {t(
              "Choose any component below to simulate a failure or breaking change.",
              "Nhấp vào thành phần bên dưới để giả lập sự cố hoặc thay đổi API.",
            )}
          </li>
          <li className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2">
            <span className="font-semibold text-teal-800">
              {t("2. Inspect blast radius:", "2. Quan sát bán kính ảnh hưởng:")}
            </span>{" "}
            {t(
              "Trace upstream callers vs. unaffected nodes along directed edges.",
              "Xem các caller phụ thuộc ngược chiều mũi tên và vùng cách ly an toàn.",
            )}
          </li>
          <li className="rounded-xl border border-teal-100 bg-white/90 px-3 py-2">
            <span className="font-semibold text-teal-800">
              {t("3. Verify 3E & move on:", "3. Đối chiếu 3E & sang Quiz:")}
            </span>{" "}
            {t(
              "Proceed to Step 3 Quiz to unlock the interactive Studio Live Lab.",
              "Chuyển sang Bước 3 làm Quiz kiểm tra kiến thức để mở khóa Studio Live.",
            )}
          </li>
        </ol>
      </div>

      <DetailPanel
        title={t(
          "Reference Architecture Views (Back-Links)",
          "Sơ đồ kiến trúc tham chiếu (Liên kết nhanh)",
        )}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {onOpenC1C3View
            ? t(
                "Switch directly back to any Step 1 C1-C3 diagram or Dependency Graph view inside this Lab.",
                "Chuyển nhanh về các góc nhìn C1-C3 hoặc Đồ thị phụ thuộc ở Bước 1 ngay trong Lab này.",
              )
            : t(
                "Jump back to C1-C3 read-only views or the full Change Impact workspace using this Lab's pinned model revision.",
                "Mở lại các góc nhìn chỉ đọc C1-C3 hoặc trang phân tích tác động đầy đủ theo đúng revision mô hình đã ghim của Lab.",
              )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onOpenC1C3View ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenC1C3View("CONTEXT")}
              >
                C1 System Context
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenC1C3View("CONTAINER")}
              >
                C2 Container
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenC1C3View("COMPONENT")}
              >
                C3 Component
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenC1C3View("GRAPH")}
              >
                {t("Service Dependency Graph", "Đồ thị phụ thuộc Service")}
              </Button>
            </>
          ) : modelQuery ? (
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

      <DetailPanel
        title={t("Reverse BFS Static Impact Explorer", "Khám phá tác động tĩnh theo Reverse BFS")}
      >
        {!modelId ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "Waiting for pinned static analysis model before running Reverse BFS.",
              "Đang chờ mô hình phân tích tĩnh được ghim để chạy Reverse BFS.",
            )}
          </p>
        ) : modelQueryResult.isPending ? (
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
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>{t("Target element (if modified)", "Phần tử mục tiêu (nếu thay đổi)")}</span>
                <select
                  aria-label="Target element for Reverse BFS"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                  value={activeTargetId}
                  onChange={(event) => {
                    setDemoLeafActive(false);
                    setSelectedTargetId(event.target.value);
                  }}
                >
                  {impact.candidateTargets.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} ({candidate.elementType})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>{t("Traversal granularity", "Phạm vi duyệt đồ thị")}</span>
                <select
                  aria-label="Reverse BFS traversal scope"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                  value={scope}
                  onChange={(event) => {
                    setDemoLeafActive(false);
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

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  Visited Set: {blastRadiusCount} {t("nodes visited cleanly", "node đã duyệt an toàn")}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-teal-300 bg-teal-50 font-mono text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
                >
                  {t("Blast Radius", "Bán kính ảnh hưởng")}: {blastRadiusCount}/{totalScopedNodes} ({blastRadiusPercent}%)
                </Badge>
                <span className="text-muted-foreground">
                  {t(
                    "Cycle-safe Reverse BFS prevents infinite loops on mutual dependencies.",
                    "Reverse BFS dùng Visited Set chống lặp vô hạn trên phụ thuộc vòng.",
                  )}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant={demoLeafActive ? "default" : "outline"}
                className={
                  demoLeafActive
                    ? "h-7 bg-amber-600 px-2.5 text-xs text-white hover:bg-amber-700"
                    : "h-7 border-amber-300 px-2.5 text-xs text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                }
                onClick={() => setDemoLeafActive((cur) => !cur)}
              >
                🧪 {t("Test Isolated 0-Upstream Node (DS-03b)", "Test Node Cô lập 0 Upstream (Demo DS-03b)")}
              </Button>
            </div>

            {(demoLeafActive || impact.upstreamImpacted.length === 0) && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="font-bold">
                    DS-03b (Zero Upstream Impact) ·{" "}
                    {demoLeafActive ? "audit-archiver-cron (Leaf Node)" : impact.targetName}
                  </p>
                  <p>
                    {t(
                      "This node has 0 inbound upstream callers — Blast Radius = 1 (Origin only, zero cascading upstream propagation).",
                      "Node này không có thành phần gọi ngược (0 upstream callers) — Bán kính ảnh hưởng = 1 (Không lan truyền dây chuyền).",
                    )}
                  </p>
                </div>
              </div>
            )}

            {impact.cyclesDetected && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-semibold text-foreground">
                    {t(
                      "Cycle Detected & Safely Terminated",
                      "Phát hiện phụ thuộc vòng & đã dừng an toàn",
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {t(
                      `Visited-node tracking prevented infinite traversal across cycle nodes: ${impact.cycleNodeNames.join(", ")}.`,
                      `Cơ chế đánh dấu nút đã thăm đã ngăn lặp vô hạn trên chu trình: ${impact.cycleNodeNames.join(", ")}.`,
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("Target", "Mục tiêu")}
                </p>
                <p className="mt-1 truncate text-sm font-semibold">{impact.targetName}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("Direct Callers (Hop 1)", "Gọi trực tiếp (Hop 1)")}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold">{directCallers.length}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("Indirect Callers (Hop 2+)", "Ảnh hưởng gián tiếp (Hop 2+)")}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold">{indirectCallers.length}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("Unaffected / Isolated", "Không bị ảnh hưởng / Cô lập")}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold">
                  {impact.unaffectedElements.length}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({impact.isolatedCount} {t("isolated", "cô lập")})
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
                  <GitBranch className="size-3.5" aria-hidden="true" />
                  {t(
                    "Impacted Upstream Chains (Reverse BFS)",
                    "Chuỗi ảnh hưởng ngược dòng (Reverse BFS)",
                  )}
                </h4>
                {impact.upstreamImpacted.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t(
                      "No upstream callers depend on this element within the selected scope.",
                      "Không có caller ngược dòng nào phụ thuộc vào phần tử này trong phạm vi đã chọn.",
                    )}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {impact.upstreamImpacted.map((entry) => (
                      <li
                        key={entry.elementId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{entry.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {entry.hops.join(" -> ")}
                          </span>
                        </div>
                        <Badge variant={entry.distance === 1 ? "default" : "secondary"}>
                          {entry.distance === 1
                            ? "Direct · Hop 1"
                            : `Indirect · Hop ${entry.distance}`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
                  <Layers className="size-3.5" aria-hidden="true" />
                  {t(
                    "Unaffected & Isolated Elements (Excluded from Blast Radius)",
                    "Phần tử không bị ảnh hưởng & cô lập (Loại khỏi vùng tác động)",
                  )}
                </h4>
                {impact.unaffectedElements.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t(
                      "All other projected elements lie upstream of this target.",
                      "Tất cả phần tử khác đều nằm ở nhánh gọi ngược dòng.",
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {impact.unaffectedElements.map((item) => (
                      <Badge key={item.elementId} variant="outline" className="font-normal">
                        {item.name}
                        {item.isolated ? ` · ${t("Isolated", "Cô lập")}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
