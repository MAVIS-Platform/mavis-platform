"use client";

import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  UploadCloud,
  FileArchive,
  CircleCheck,
  CircleX,
  LoaderCircle,
  CircleAlert,
  Boxes,
  GitBranch,
  Play,
  RotateCcw,
  Info,
  Package,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "empty" | "validating" | "ready" | "analyzing" | "done";

const checkItems = [
  { label: "Valid ZIP archive", detail: "Central directory readable" },
  { label: "Size within limits", detail: "Under 200 MB per archive" },
  { label: "Service manifests found", detail: "package.json, go.mod, Cargo.toml" },
  { label: "No secrets in config", detail: "Scanned .env, credentials files" },
];

const detectedServices = [
  { name: "auth-service", lang: "TypeScript", files: 42, port: "3001", tag: "NestJS" },
  { name: "payments-api", lang: "Go", files: 68, port: "8080", tag: "gRPC" },
  { name: "api-gateway", lang: "Rust", files: 31, port: "8000", tag: "Axum" },
  { name: "notification-worker", lang: "TypeScript", files: 19, port: "—", tag: "BullMQ" },
  { name: "ledger-service", lang: "Go", files: 54, port: "8081", tag: "gRPC" },
];

const detectedDependencies = [
  { name: "grpc", version: "1.62.0", scope: "direct", risk: "low" },
  { name: "nestjs/core", version: "10.3.1", scope: "direct", risk: "low" },
  { name: "axios", version: "1.6.7", scope: "direct", risk: "medium" },
  { name: "lodash", version: "4.17.21", scope: "transitive", risk: "low" },
  { name: "jsonwebtoken", version: "9.0.2", scope: "direct", risk: "medium" },
];

const analysisSteps = [
  "Uploading archive",
  "Extracting files",
  "Parsing service manifests",
  "Building dependency graph",
  "Running static analysis",
  "Generating report",
];

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>("empty");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleFile(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    setProjectName(selected.name.replace(/\.zip$/i, ""));
    setStage("validating");
    setTimeout(() => setStage("ready"), 1100);
  }

  function startAnalysis() {
    if (stage !== "ready") return;
    setStage("analyzing");
    setProgress(0);
    setCurrentStep(0);
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 1 + Math.floor(Math.random() * 3), 100);
        setCurrentStep(
          Math.min(Math.floor((next / 100) * analysisSteps.length), analysisSteps.length - 1),
        );
        if (next >= 100) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeout(() => setStage("done"), 400);
        }
        return next;
      });
    }, 180);
  }

  function reset() {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage("empty");
    setFile(null);
    setProjectName("");
    setDescription("");
    setProgress(0);
    setCurrentStep(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasFile = stage !== "empty";
  const ready = stage === "ready" || stage === "analyzing" || stage === "done";

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Import & Analyze</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a project archive, review what MAVIS detects, then start the analysis.
          </p>
        </div>
        {hasFile && (
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <RotateCcw className="size-4" />
            Start over
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: upload + project info */}
        <div className="space-y-6 xl:col-span-2">
          <UploadArea
            stage={stage}
            dragging={dragging}
            file={file}
            inputRef={inputRef}
            onFile={handleFile}
            onDragState={setDragging}
          />

          {stage === "validating" && <ValidatingCard file={file} />}

          {(stage === "ready" || stage === "analyzing" || stage === "done") && (
            <>
              <ValidationChecks />
              <ProjectInfo
                file={file}
                projectName={projectName}
                description={description}
                onName={setProjectName}
                onDescription={setDescription}
                disabled={stage !== "ready"}
              />
              <DetectedServices />
              <DetectedDependencies />
            </>
          )}
        </div>

        {/* Right: analysis progress */}
        <div className="space-y-6">
          <AnalysisPanel
            stage={stage}
            progress={progress}
            currentStep={currentStep}
            onStart={startAnalysis}
          />
        </div>
      </div>
    </AppShell>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadArea({
  stage,
  dragging,
  file,
  inputRef,
  onFile,
  onDragState,
}: {
  stage: Stage;
  dragging: boolean;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File | null) => void;
  onDragState: (d: boolean) => void;
}) {
  const collapsed = stage !== "empty" && stage !== "validating";
  const active = stage === "empty" || stage === "validating";

  if (collapsed) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <FileArchive className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file?.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {file ? formatSize(file.size) : ""} · uploaded
          </p>
        </div>
        <CircleCheck className="size-4 text-success" />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragState(true);
      }}
      onDragLeave={() => onDragState(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragState(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        "relative rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center shadow-sm transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <UploadCloud className="size-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">Drag & drop your project ZIP here</p>
      <p className="mt-1 text-xs text-muted-foreground">
        or{" "}
        <button
          onClick={() => inputRef.current?.click()}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          browse your files
        </button>{" "}
        — .zip up to 200 MB
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
          <ShieldCheck className="size-3" />
          Scanned for secrets
        </span>
        <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5">
          <Package className="size-3" />
          Manifest auto-detection
        </span>
      </div>
    </div>
  );
}

function ValidatingCard({ file }: { file: File | null }) {
  return (
    <section className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <LoaderCircle className="size-5 animate-spin text-primary" />
      <div>
        <p className="text-sm font-medium text-foreground">Validating archive…</p>
        <p className="font-mono text-xs text-muted-foreground">
          {file?.name} · {file ? formatSize(file.size) : ""}
        </p>
      </div>
    </section>
  );
}

function ValidationChecks() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">File validation</h2>
        <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
          <CircleCheck className="size-3" />
          Passed
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {checkItems.map((item) => (
          <li key={item.label} className="flex items-center gap-3 px-5 py-3">
            <CircleCheck className="size-4 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{item.label}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectInfo({
  file,
  projectName,
  description,
  onName,
  onDescription,
  disabled,
}: {
  file: File | null;
  projectName: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Project information</h2>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Project name</span>
            <input
              value={projectName}
              onChange={(e) => onName(e.target.value)}
              disabled={disabled}
              className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Source archive</span>
            <div className="mt-1.5 flex h-9 items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 font-mono text-xs text-muted-foreground">
              <FileArchive className="size-3.5 shrink-0" />
              <span className="truncate">{file?.name ?? "—"}</span>
              <span className="ml-auto shrink-0">{file ? formatSize(file.size) : ""}</span>
            </div>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Description</span>
          <textarea
            value={description}
            onChange={(e) => onDescription(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="What does this project do?"
            className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </label>
      </div>
    </section>
  );
}

const langTint: Record<string, string> = {
  TypeScript: "bg-primary/10 text-primary",
  Go: "bg-info/10 text-info",
  Rust: "bg-warning/10 text-warning",
};

function DetectedServices() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Detected services</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {detectedServices.length} found
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {detectedServices.map((service) => (
          <li key={service.name} className="flex items-center gap-3 px-5 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Boxes className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-medium text-foreground">
                {service.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {service.files} source files · port {service.port}
              </p>
            </div>
            <span
              className={cn(
                "hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex",
                langTint[service.lang] ?? "bg-muted text-muted-foreground",
              )}
            >
              {service.lang}
            </span>
            <span className="hidden rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground md:inline-flex">
              {service.tag}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-2 border-t border-border bg-muted/40 px-5 py-2.5">
        <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Services are detected from manifests and entry points — you can adjust the list after the
          first analysis.
        </p>
      </div>
    </section>
  );
}

const riskTint: Record<string, string> = {
  low: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  high: "bg-destructive/10 text-destructive",
};

function DetectedDependencies() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Detected dependencies</h2>
        <span className="font-mono text-xs text-muted-foreground">3 direct · 2 transitive</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Package</th>
              <th className="px-5 py-2.5 font-medium">Version</th>
              <th className="px-5 py-2.5 font-medium">Scope</th>
              <th className="px-5 py-2.5 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {detectedDependencies.map((dep) => (
              <tr
                key={dep.name}
                className="border-b border-border/60 last:border-0 hover:bg-accent/40"
              >
                <td className="px-5 py-2.5 font-mono font-medium text-foreground">{dep.name}</td>
                <td className="px-5 py-2.5 font-mono text-muted-foreground">{dep.version}</td>
                <td className="px-5 py-2.5 capitalize text-muted-foreground">{dep.scope}</td>
                <td className="px-5 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      riskTint[dep.risk],
                    )}
                  >
                    {dep.risk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AnalysisPanel({
  stage,
  progress,
  currentStep,
  onStart,
}: {
  stage: Stage;
  progress: number;
  currentStep: number;
  onStart: () => void;
}) {
  return (
    <section className="sticky top-20 rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Analysis</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Full scan: manifests, dependency graph and static checks.
        </p>
      </div>

      {stage === "done" ? (
        <div className="px-5 py-5 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-success/10">
            <CircleCheck className="size-6 text-success" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Analysis complete</p>
          <p className="mt-1 text-xs text-muted-foreground">
            5 services · 468 files · 1,204 edges mapped
          </p>
          <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            Open report
          </button>
          <button
            onClick={onStart}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Run again
          </button>
        </div>
      ) : (
        <>
          <ol className="space-y-3 px-5 py-4">
            {analysisSteps.map((step, i) => {
              const done =
                stage === "ready"
                  ? false
                  : i < currentStep || (stage !== "empty" && progress >= 100);
              const active = stage === "analyzing" && i === currentStep;
              return (
                <li key={step} className="flex items-center gap-3">
                  {done ? (
                    <CircleCheck className="size-4 shrink-0 text-success" />
                  ) : active ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border">
                      <span className="size-1.5 rounded-full bg-border" />
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-sm",
                      done || active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step}
                  </span>
                  {active && (
                    <span className="ml-auto font-mono text-xs text-primary">{progress}%</span>
                  )}
                </li>
              );
            })}
          </ol>

          {stage === "analyzing" && (
            <div className="px-5 pb-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {stage === "empty" && (
            <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Upload an archive to enable analysis.</p>
            </div>
          )}

          <div className="border-t border-border px-5 py-4">
            <button
              onClick={onStart}
              disabled={stage !== "ready"}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors",
                stage === "ready"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              <Play className="size-4" />
              Start Analysis
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Estimated time: ~4 min for this archive size
            </p>
          </div>
        </>
      )}
    </section>
  );
}
