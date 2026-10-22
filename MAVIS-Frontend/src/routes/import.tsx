"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { FormField } from "@/components/shared/forms";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi, useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { FlowFrame } from "@/components/mainflow/shell";
import { ImportFlow as LiveImportFlow } from "@/components/mainflow/import-flow";
import { ProjectSelector } from "@/features/projects/components";
import { AnalysisStatusIndicator } from "@/features/source-analysis/components";
export default function ImportPage() {
  const api = useApi();
  if (api.mode === "backend")
    return (
      <FlowFrame title="Import & Analyze">
        <LiveImportFlow />
      </FlowFrame>
    );
  return (
    <AppShell>
      <SourceImport />
    </AppShell>
  );
}
function SourceImport() {
  const { projectId } = useSelection();
  return (
    <PageContainer>
      <SectionHeader
        title="Import & Analyze"
        description="Import source → validate → analyze → inspect the selected result version."
      />
      <ProjectSelector />
      {projectId && <ImportFlow key={projectId} projectId={projectId} />}
    </PageContainer>
  );
}
function ImportFlow({ projectId }: { projectId: string }) {
  const upload = useApiMutation("importSource");
  const start = useApiMutation("startAnalysis");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [validation, setValidation] = useState<string>();
  const [checking, setChecking] = useState(false);
  const job = useApiQuery(
    "analysisJob",
    { jobId: start.data?.id ?? "" },
    { enabled: Boolean(start.data), poll: Boolean(start.data) },
  );
  const snapshot = upload.data;
  const busy =
    checking ||
    upload.isPending ||
    start.isPending ||
    Boolean(
      start.data &&
      (job.isPending || (job.data && ["queued", "processing"].includes(job.data.status))),
    );
  async function validateAndImport() {
    if (!file || !name.trim()) {
      setValidation("Select a ZIP archive and enter a project source name.");
      return;
    }
    if (!/\.zip$/i.test(file.name) || !file.size || file.size > 200 * 1024 * 1024) {
      setValidation("Choose a non-empty ZIP archive up to 200 MB.");
      return;
    }
    setChecking(true);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    } catch {
      setValidation("The archive could not be read. Select the file again.");
      setChecking(false);
      return;
    }
    setChecking(false);
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) {
      setValidation("The selected file does not have a supported ZIP signature.");
      return;
    }
    setValidation(undefined);
    upload.mutate({ projectId, name, fileName: file.name, size: file.size, archive: file });
  }
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <DetailPanel title="Source archive">
          <FormField
            label="ZIP source archive"
            error={validation}
            hint="Only basic file checks run in this browser. Server validation must inspect archive contents, supported languages and secrets."
          >
            {(props) => (
              <Input
                {...props}
                type="file"
                accept=".zip"
                disabled={busy || Boolean(snapshot)}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setName(event.target.files?.[0]?.name.replace(/\.zip$/i, "") ?? "");
                  setValidation(undefined);
                }}
              />
            )}
          </FormField>
          <FormField label="Source name">
            {(props) => (
              <Input
                {...props}
                value={name}
                maxLength={100}
                disabled={busy || Boolean(snapshot)}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <Button
            disabled={busy || Boolean(snapshot)}
            onClick={() => {
              void validateAndImport();
            }}
          >
            {upload.isPending ? "Validating source…" : "Validate & import source"}
          </Button>
          {upload.isError && (
            <ErrorState
              error={upload.error}
              onRetry={() => {
                void validateAndImport();
              }}
            />
          )}
          {snapshot && (
            <>
              <StatusBadge
                status={snapshot.validation}
                variant={snapshot.validation === "valid" ? "success" : "destructive"}
              />
              <p className="text-sm text-muted-foreground">
                Snapshot {snapshot.id}.{" "}
                {snapshot.evidenceComplete
                  ? "Evidence coverage reported complete."
                  : "Evidence coverage is incomplete; inspect results carefully."}
              </p>
              {snapshot.validation !== "valid" && (
                <p role="alert" className="text-sm text-destructive">
                  This source is invalid or unsupported. Select another archive.
                </p>
              )}
            </>
          )}
        </DetailPanel>
        {snapshot && !busy && (
          <Button
            variant="outline"
            onClick={() => {
              upload.reset();
              start.reset();
              setFile(null);
              setName("");
            }}
          >
            Import another snapshot
          </Button>
        )}
      </div>
      <DetailPanel title="Analysis status">
        {!snapshot ? (
          <p className="text-sm text-muted-foreground">
            Import and validate source before starting analysis.
          </p>
        ) : (
          <>
            <Button
              disabled={
                busy ||
                snapshot.validation !== "valid" ||
                Boolean(start.data && job.data?.status !== "failed")
              }
              onClick={() => start.mutate({ projectId, snapshotId: snapshot.id })}
            >
              {start.isPending
                ? "Starting…"
                : job.data?.status === "failed"
                  ? "Retry analysis"
                  : "Start analysis"}
            </Button>
            {start.isError && (
              <ErrorState
                error={start.error}
                onRetry={() => start.mutate({ projectId, snapshotId: snapshot.id })}
              />
            )}
            {start.data && (
              <RequestState query={job}>
                {job.data && <AnalysisStatusIndicator job={job.data} />}
                {job.data?.status === "completed" && (
                  <Button asChild variant="outline">
                    <Link href="/architecture">View result versions</Link>
                  </Button>
                )}
              </RequestState>
            )}
          </>
        )}
      </DetailPanel>
    </div>
  );
}
