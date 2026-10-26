"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-api";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { FormField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi, useApiMutation, useSelection } from "@/hooks/use-api";
import { ImportFlow as LiveImportFlow } from "@/components/mainflow/import-flow";
import { ProjectSelector } from "@/features/projects/components";

export default function ImportPage() {
  return (
    <AppShell>
      <ImportContent />
    </AppShell>
  );
}

function ImportContent() {
  const api = useApi();
  const session = useSession(),
    { workspaceId } = useSelection(),
    router = useRouter();
  const teaching = !!workspaceId && ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  useEffect(() => {
    if (teaching) router.replace(`/assignments?workspace=${encodeURIComponent(workspaceId!)}`);
  }, [teaching, workspaceId, router]);
  if (teaching)
    return (
      <PageContainer>
        <p role="status">Opening assignment source setup…</p>
      </PageContainer>
    );
  if (api.mode === "backend")
    return (
      <PageContainer>
        <SectionHeader
          title="Import Project Source"
          description="Import source code from a ZIP archive or GitHub repository to create a new snapshot."
        />
        <ProjectSelector />
        <LiveImportFlow />
      </PageContainer>
    );
  return <SourceImport />;
}

function SourceImport() {
  const { projectId } = useSelection();
  return (
    <PageContainer>
      <SectionHeader
        title="Import Project Source"
        description="Import source code from a ZIP archive or GitHub repository to create a new snapshot."
      />
      <ProjectSelector />
      {projectId && <ImportFlow key={projectId} projectId={projectId} />}
    </PageContainer>
  );
}

function ImportFlow({ projectId }: { projectId: string }) {
  const router = useRouter();
  const upload = useApiMutation("importSource");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [validation, setValidation] = useState<string>();
  const [checking, setChecking] = useState(false);
  const snapshot = upload.data;
  const busy = checking || upload.isPending;

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
    upload.mutate(
      { projectId, name, fileName: file.name, size: file.size, archive: file },
      {
        onSuccess: (created) => {
          if (created.validation === "valid") {
            router.push(`/snapshots?project=${encodeURIComponent(projectId)}&snapshot=${encodeURIComponent(created.id)}`);
          }
        },
      },
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
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
            setFile(null);
            setName("");
          }}
        >
          Import another snapshot
        </Button>
      )}
    </div>
  );
}

