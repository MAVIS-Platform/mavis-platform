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

/**
 * Step 2 interactive Reverse BFS impact explorer and C1-C3 reference view back-links
 * grounded exclusively on the Lab's pinned static architectural model.
 */
export function Step2StaticImpact({
  projectId,
  modelId,
  modelQuery,
  sourceLink,
}: {
  projectId: string;
  modelId?: string | undefined;
  modelQuery: string | null;
  sourceLink: string;
}) {
  const { t } = useLocale();
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [scope, setScope] = useState<ImpactScopeMode>("all");

  const modelQueryResult = useApiQuery(
    "model",
    { modelId: modelId ?? "", ...(projectId ? { projectId } : {}) },
    { enabled: Boolean(modelId) },
  );
  const model = modelQueryResult.data;

  const activeTargetId = useMemo(() => {
    if (!model || model.elements.length === 0) return "";
    if (selectedTargetId && model.elements.some((el) => el.id === selectedTargetId)) {
      return selectedTargetId;
    }
    const preferred =
      model.elements.find((el) => el.elementType === "SERVICE_CONTAINER") ?? model.elements[0]!;
    return preferred.id;
  }, [model, selectedTargetId]);

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

  return (
    <div className="space-y-5">
      <DetailPanel
        title={t("Reference Architecture Views (Back-Links)", "Sơ đồ kiến trúc tham chiếu (Liên kết nhanh)")}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {t(
            "Jump back to C1-C3 read-only views or the full Change Impact workspace using this Lab's pinned model revision.",
            "Mở lại các góc nhìn chỉ đọc C1-C3 hoặc trang phân tích tác động đầy đủ theo đúng revision mô hình đã ghim của Lab.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
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

      <DetailPanel
        title={t(
          "Reverse BFS Static Impact Explorer",
          "Khám phá tác động tĩnh theo Reverse BFS",
        )}
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
                  onChange={(event) => setSelectedTargetId(event.target.value)}
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
                  onChange={(event) => setScope(event.target.value as ImpactScopeMode)}
                >
                  <option value="all">{t("All architectural nodes", "Tất cả nút kiến trúc")}</option>
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
                  {t("Impacted Upstream Chains (Reverse BFS)", "Chuỗi ảnh hưởng ngược dòng (Reverse BFS)")}
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
                    {t("All other projected elements lie upstream of this target.", "Tất cả phần tử khác đều nằm ở nhánh gọi ngược dòng.")}
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
