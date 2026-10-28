"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, ArrowRight, ExternalLink, Activity, CheckCircle2, Clock } from "lucide-react";
import { RuntimeStepperBanner } from "./screens";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { DetailPanel } from "@/components/shared/data";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { SelectField, ConfirmDialog, SearchInput } from "@/components/shared/forms";
import { AdminToolbar } from "@/features/administration/operations";
import { Button } from "@/components/ui/button";
const active = new Set([
  "NOT_STARTED",
  "PENDING",
  "READY_FOR_DISPATCH",
  "APPROVED",
  "ALLOCATED",
  "RUNNING",
  "CANCELLING",
]);
export function BackendRuntime({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  return <RuntimeProject key={projectId} administrative={administrative} />;
}
function RuntimeProject({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  const [snapshot, setSnapshot] = useState("");
  const preflight = useApiMutation("runtimePreflight");
  const list = useApiQuery(
    "runtimeReadSessions",
    { projectId: administrative ? "*" : projectId },
    { enabled: administrative || !!projectId, poll: true },
  );
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const visible = administrative
    ? (list.data ?? []).filter(
        (s) =>
          (s.id + " " + (s.scenarioName ?? "")).toLowerCase().includes(search.toLowerCase()) &&
          (status === "all" || s.executionStatus === status),
      )
    : (list.data ?? []);
  const params = useSearchParams();
  const requestedSession = params.get("session") ?? "";
  const selectedId = visible.find((s) => s.id === selected)?.id ||
    ((!administrative || (!search && status === "all")) ? requestedSession : "") || visible[0]?.id || "";
  const session = useApiQuery(
    "runtimeReadSession",
    { sessionId: selectedId },
    { enabled: !!selectedId, poll: true },
  );
  const sessionOptions = session.data && !visible.some(s => s.id === session.data?.id)
    ? [session.data, ...visible] : visible;
  const sequence = useApiQuery(
    "runtimeSequence",
    { sessionId: selectedId },
    {
      enabled:
        !!selectedId &&
        ["CAPTURED", "AVAILABLE", "COMPLETE", "COMPLETED"].includes(
          session.data?.evidenceStatus ?? "",
        ),
    },
  );
  const stop = useApiMutation("runtimeStop");
  const approve = useApiMutation("runtimeApprove");
  const [action, setAction] = useState<"stop" | "approve" | null>(null);
  const models = useApiQuery("models", { projectId }, { enabled: !!projectId });
  const startRuntime = useApiMutation("startRuntime");
  const [quickRunRunning, setQuickRunRunning] = useState(false);
  const [quickRunMsg, setQuickRunMsg] = useState("");

  const handleQuickRun = async () => {
    if (!projectId || !snapshots.data?.length) return;
    setQuickRunRunning(true);
    setQuickRunMsg("Đang khởi tạo phiên kiểm thử tự động 1-Click...");

    const latestSnapshot = snapshots.data[snapshots.data.length - 1];
    const latestModel = models.data?.[models.data.length - 1];
    if (!latestSnapshot) return;

    try {
      const res = await startRuntime.mutateAsync({
        projectId,
        snapshotId: latestSnapshot.id,
        modelId: latestModel?.id,
        scenarioId: "auto-" + Math.random().toString(16).slice(2, 8),
        scenarioName: "1-Click Auto Verify · " + new Date().toLocaleTimeString(),
        steps: [
          { id: "step-1", title: "Health Check", service: "gateway", method: "GET", path: "/health", expectedStatus: 200 },
          { id: "step-2", title: "API Transaction", service: "orders", method: "GET", path: "/orders", expectedStatus: 200 },
        ],
        configurationRevision: 1,
        scenarioRevision: 1,
        approved: true,
      });

      setSelected(res.id);
      setQuickRunMsg(`Đã kích hoạt phiên ${res.id.slice(0, 8)} thành công! Trạng thái: ${res.executionStatus || res.status}`);
      void list.refetch();
    } catch (err) {
      setQuickRunMsg("Lỗi khi chạy: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setQuickRunRunning(false);
    }
  };
  if (!projectId && !administrative)
    return (
      <DetailPanel title="Runtime">
        <p>Select a project to check source eligibility and inspect its runtime sessions.</p>
        {administrative && (
          <p>Global runtime sessions are not provided by this backend; select a project.</p>
        )}
      </DetailPanel>
    );
  return (
    <div className="space-y-5">
      <RuntimeStepperBanner currentStep={3} projectId={projectId} />
      {!administrative && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary animate-pulse" />
              <h4 className="font-bold text-sm text-foreground">
                Khởi chạy Kiểm thử Runtime Tự động 1-Click (Khuyến nghị)
              </h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Tự động chọn Snapshot và Model mới nhất, tạo session kiểm thử với các endpoint mẫu và gửi lệnh thực thi ngay lập tức.
            </p>
            {quickRunMsg && (
              <p className="text-xs font-medium text-primary mt-1">
                {quickRunMsg}
              </p>
            )}
          </div>
          <Button
            onClick={handleQuickRun}
            disabled={quickRunRunning || !snapshots.data?.length}
            className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow"
          >
            {quickRunRunning ? "Đang chạy..." : "⚡ Chạy 1-Click Ngay"}
          </Button>
        </div>
      )}
      {!administrative && (
        <DetailPanel title="Runtime prerequisites">
          <p className="text-sm text-muted-foreground">
            Execution profiles and scenario versions are provisioned by the operator. Approval
            queues an existing session; it does not prove that a workload is running. Automatic
            launch is not connected in this interface.
          </p>
          <RequestState query={snapshots} empty={!snapshots.data?.length}>
            <SelectField
              disabled={preflight.isPending}
              label="Runtime source snapshot"
              value={snapshot}
              onChange={(value) => {
                setSnapshot(value);
                preflight.reset();
              }}
              options={(snapshots.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.id.slice(0, 8)}`,
              }))}
            />
            <Button
              className="mt-3"
              disabled={!snapshot || preflight.isPending}
              onClick={() => preflight.mutate({ projectId, snapshotId: snapshot })}
            >
              Check runtime eligibility
            </Button>
            {preflight.isError && <ErrorState error={preflight.error} />}
            <PreflightResult result={preflight.data} />
          </RequestState>
        </DetailPanel>
      )}
      {administrative && (
        <>
          <AdminToolbar
            fetching={list.isFetching}
            updatedAt={list.dataUpdatedAt}
            refresh={() => void list.refetch()}
          >
            <span className="text-sm text-muted-foreground">
              Latest 50 sessions · inspect before stopping a run
            </span>
          </AdminToolbar>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
            <SearchInput label="Search session or scenario" value={search} onChange={setSearch} />
            <SelectField
              label="Execution status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                ...Array.from(new Set((list.data ?? []).map((s) => s.executionStatus)))
                  .sort()
                  .map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        </>
      )}
      <DetailPanel title="Runtime sessions">
        <RequestState
          query={list}
          empty={!visible.length && !selectedId}
          emptyMessage={
            administrative
              ? "No sessions match this view. Try clearing the filters or refresh to check for new runs."
              : "No runtime session exists for this project. Save a configuration and scenario above, then approve and queue a session."
          }
        >
          <SelectField
            label="Runtime session"
            value={selectedId}
            onChange={setSelected}
            options={sessionOptions.map((s) => ({
              value: s.id,
              label: `${s.scenarioName ?? s.id.slice(0, 8)} · ${s.executionStatus}`,
            }))}
          />
          {selectedId && (
            <RequestState query={session}>
              {session.data && (
                <>
                                    {["COMPLETED", "COMPLETE"].includes(session.data.executionStatus) && (
                    <div className="my-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        Phiên Runtime đã hoàn tất! Các kết nối đã được xác thực thực tế.
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Mô hình kiến trúc đã được cập nhật với các quan hệ <strong className="text-emerald-300 font-mono">VERIFIED_RUNTIME</strong> và sơ đồ tuần tự OpenTelemetry.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm" asChild>
                          <Link href={`/architecture?project=${projectId}${session.data.modelId ? `&model=${session.data.modelId}` : ""}`}>
                            <ExternalLink className="h-3 w-3 mr-1" />
                            🔍 Mở Đồ thị Kiến trúc Đã xác thực Runtime (RUNTIME_ENRICHED)
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs" asChild>
                          <Link href={`/diagrams?project=${projectId}${session.data.modelId ? `&model=${session.data.modelId}` : ""}`}>
                            📊 Xem Sơ đồ Tuần tự (UML Sequence Diagram)
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                  <dl className="my-4 grid gap-2 sm:grid-cols-2">
                    {[
                      "executionStatus",
                      "scenarioStatus",
                      "evidenceStatus",
                      "cleanupStatus",
                      "traceQuality",
                      "mappingStatus",
                    ].map((key) => (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">{key}</dt>
                        <dd className="text-sm">
                          {String(session.data![key as keyof NonNullable<typeof session.data>])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="my-3 space-y-2">
                    <Button
                      variant="outline"
                      disabled={sequence.isFetching}
                      onClick={() => void sequence.refetch()}
                    >
                      Load observed sequence
                    </Button>
                    {sequence.isError && <ErrorState error={sequence.error} />}{" "}
                    {sequence.data?.steps.length ? (
                      <div className="space-y-3 pt-2">
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                          <Activity className="h-3.5 w-3.5 text-primary" />
                          Chuỗi Gọi Thực Tế Được Ghi Nhận (OpenTelemetry Spans)
                        </p>
                        <div className="space-y-2">
                          {sequence.data.steps.map((step, i) => (
                            <div
                              key={`${step.traceId ?? "trace"}:${i}`}
                              className="relative pl-6 pb-3 border-l-2 border-primary/30 last:border-l-transparent last:pb-0"
                            >
                              <div className="absolute -left-2 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow">
                                {i + 1}
                              </div>
                              <div className="rounded-lg border border-border/80 bg-background/95 p-3 shadow-sm space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                                    <span className="rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5">
                                      {step.callerService ?? "Caller"}
                                    </span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5">
                                      {step.calleeService ?? "Receiver"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] font-mono">
                                    {step.httpStatusCode && (
                                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                                        step.httpStatusCode >= 200 && step.httpStatusCode < 300
                                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                      }`}>
                                        HTTP {step.httpStatusCode}
                                      </span>
                                    )}
                                    {step.durationMs != null && (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {step.durationMs} ms
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {step.operation && (
                                  <p className="font-mono text-[11px] text-muted-foreground">
                                    Endpoint: <span className="text-foreground font-semibold">{step.httpMethod ?? "CALL"} {step.operation}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : sequence.data ? (
                      <p className="text-sm">No observed interactions recorded for this session.</p>
                    ) : null}
                  </div>
                  <p className="break-all text-xs">
                    Source: {session.data.snapshotId} · Model:{" "}
                    {session.data.modelId ?? "Not reported"}
                  </p>
                  <p className="text-sm">Profile: {session.data.profileName ?? "Not reported"}</p>
                  <div className="mt-3 flex gap-3">
                    {["NOT_STARTED", "PENDING"].includes(session.data.executionStatus) && (
                      <Button disabled={approve.isPending} onClick={() => setAction("approve")}>
                        Approve operator session
                      </Button>
                    )}
                    {active.has(session.data.executionStatus) &&
                      session.data.executionStatus !== "CANCELLING" && (
                        <Button
                          variant="outline"
                          disabled={stop.isPending}
                          onClick={() => setAction("stop")}
                        >
                          Stop session
                        </Button>
                      )}
                  </div>
                </>
              )}
            </RequestState>
          )}
        </RequestState>
      </DetailPanel>
      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={action === "approve" ? "Approve this pinned session?" : "Stop this runtime session?"}
        description={
          action === "approve"
            ? "The operator must launch the approved workload. Status changes only after actual Runner lifecycle acknowledgements."
            : "The request is scoped to this session. Cleanup is confirmed separately after the Runner finishes."
        }
        pending={stop.isPending || approve.isPending}
        error={
          stop.isError ? (
            <ErrorState error={stop.error} />
          ) : approve.isError ? (
            <ErrorState error={approve.error} />
          ) : undefined
        }
        onConfirm={() => {
          const mutation = action === "approve" ? approve : stop;
          mutation.mutate({ sessionId: selectedId }, { onSuccess: () => setAction(null) });
        }}
      />
    </div>
  );
}
function PreflightResult({
  result,
}: {
  result:
    | {
        compatible: boolean;
        detectedServices: string[];
        securityWarnings: string[];
        recommendedProfile: string | null;
      }
    | undefined;
}) {
  return result ? (
    <section className="mt-3 space-y-2 text-sm">
      <p>
        {result.compatible
          ? "Source is eligible for runtime preflight"
          : "This source is not eligible for the configured runtime flow"}
      </p>
      {result.recommendedProfile && <p>Recommended profile: {result.recommendedProfile}</p>}
      <p>Detected services: {result.detectedServices.join(", ") || "None reported"}</p>
      {result.securityWarnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
    </section>
  ) : null;
}
