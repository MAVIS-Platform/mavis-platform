"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/mainflow-api";
import { useApi } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";

type ImportResult = {
  assignmentId: string;
  title: string;
  theoryCount: number;
  quizImported: boolean;
  notes: string[];
};

function fileNameFor(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "lab"}.mavis-lab.json`;
}

export function ExportLabButton({
  workspaceId,
  assignmentId,
  title,
}: {
  workspaceId: string;
  assignmentId: string;
  title: string;
}) {
  const { t } = useLocale();
  const client = useApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setPending(true);
    setError("");
    try {
      const bundle = await api<unknown>(`workspaces/${workspaceId}/course-labs/${assignmentId}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameFor(title);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || client.mode !== "backend"}
        title={
          client.mode !== "backend"
            ? t("Lab files need the backend workspace.", "Tệp Lab cần môi trường backend.")
            : undefined
        }
        onClick={() => void download()}
      >
        <Download className="mr-1 size-4" aria-hidden="true" />
        {pending
          ? t("Preparing file…", "Đang chuẩn bị tệp…")
          : t("Download Lab file", "Tải tệp Lab")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

export function ImportLabButton({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const client = useApi();
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const importFile = async (file: File) => {
    setPending(true);
    setError("");
    setResult(null);
    try {
      let bundle: unknown;
      try {
        bundle = JSON.parse(await file.text());
      } catch {
        throw new Error(t("This file is not a valid JSON Lab bundle.", "Tệp này không phải Lab bundle JSON hợp lệ."));
      }
      const imported = await api<ImportResult>(`workspaces/${workspaceId}/course-labs/import`, {
        method: "POST",
        body: JSON.stringify(bundle),
      });
      setResult(imported);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["api", "assignments"] }),
        cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] }),
        cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] }),
        cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label={t("Import a Lab bundle", "Nhập Lab bundle")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || client.mode !== "backend"}
        onClick={() => input.current?.click()}
      >
        <Upload className="mr-1 size-4" aria-hidden="true" />
        {pending ? t("Importing…", "Đang nhập…") : t("Import Lab file", "Nhập tệp Lab")}
      </Button>
      {error && (
        <span role="alert" className="max-w-xs text-xs text-destructive">
          {error}
        </span>
      )}
      {result && (
        <div role="status" className="max-w-sm space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">
            {t(
              `Imported “${result.title}” · ${result.theoryCount} theory lesson(s)${result.quizImported ? " · Quiz draft" : ""}.`,
              `Đã nhập “${result.title}” · ${result.theoryCount} bài lý thuyết${result.quizImported ? " · nháp Quiz" : ""}.`,
            )}
          </p>
          <Link
            className="text-primary hover:underline"
            href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(result.assignmentId)}&tab=source`}
          >
            {t("Review the imported Lab", "Kiểm tra Lab vừa nhập")}
          </Link>
          {result.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
    </div>
  );
}
