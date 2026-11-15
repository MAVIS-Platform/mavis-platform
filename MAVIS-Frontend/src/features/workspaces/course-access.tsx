"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailPanel } from "@/components/shared/data";
import { FormField } from "@/components/shared/forms";
import { useApi } from "@/hooks/use-api";
import { ApiError as ProxyError, api } from "@/lib/mainflow-api";
import { ApiError, fromStatus } from "@/lib/errors/api-error";
import { useLocale } from "@/lib/i18n/locale-context";

type Lab = {
  assignmentId: string;
  position: number;
  title: string;
  state: "LOCKED" | "UNLOCKED" | "PASSED";
  reason: "PREREQUISITE" | "COURSE_ARCHIVED" | null;
};
type Roadmap = {
  guided: boolean;
  enrollmentStatus: "ENROLLED" | "IN_PROGRESS" | "COMPLETED" | null;
  labs: Lab[];
};
type KeyStatus = {
  active: boolean;
  expiresAt: string | null;
  maxStudents: number | null;
  enrolledStudents: number;
};
type IssuedKey = { code: string; expiresAt: string };

const roadmapKey = (workspaceId: string) => ["api", "course-roadmap", workspaceId];
const passkeyKey = (workspaceId: string) => ["api", "course-passkey", workspaceId];

async function courseApi<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ProxyError) throw fromStatus(error.status);
    throw error;
  }
}

function useCourseText() {
  const { locale } = useLocale();
  return (en: string, vi: string) => (locale === "vi" ? vi : en);
}

export function useCourseRoadmap(workspaceId: string) {
  const client = useApi();
  return useQuery({
    queryKey: roadmapKey(workspaceId),
    queryFn: ({ signal }) =>
      courseApi<Roadmap>(`workspaces/${workspaceId}/course-roadmap`, { signal }),
    enabled: client.mode === "backend" && !!workspaceId,
    refetchOnWindowFocus: true,
  });
}

export type CourseSetupReference = {
  projectId: string | null;
  projectName: string | null;
  modelId: string | null;
  snapshotId: string | null;
  modelRevision: number;
  referenceReady: boolean;
  runtimeConfigured: boolean;
  runtimeMatchesSource: boolean;
  runtimeRevision: number;
  applications: string[];
  blockCount: number;
  connectionCount: number;
  topologyConfigured: boolean;
};
export type CourseSetupLab = {
  assignmentId: string;
  position: number;
  title: string;
  published: boolean;
  referenceReady: boolean;
  requiresRuntime: boolean;
  studioReady: boolean;
  topologyFrozen: boolean;
  quizPublished: boolean;
  quizVersion: number;
  state: string;
};
export type CourseSetupStep = {
  id: string;
  state: "DONE" | "PARTIAL" | "ACTION" | "BLOCKED";
  detail: string;
};
export type CourseSetup = {
  workspaceId: string;
  workspaceName: string;
  status: string;
  courseMode: boolean;
  reference: CourseSetupReference;
  labs: CourseSetupLab[];
  passkey: {
    active: boolean;
    expiresAt: string | null;
    maxStudents: number | null;
    enrolledStudents: number;
  };
  steps: CourseSetupStep[];
  nextAction: string;
  previewAssignmentId: string | null;
};

export function useCourseSetup(workspaceId: string) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "course-setup", workspaceId],
    queryFn: ({ signal }) =>
      courseApi<CourseSetup>(`workspaces/${workspaceId}/course-setup`, { signal }),
    enabled: client.mode === "backend" && !!workspaceId,
    refetchOnWindowFocus: true,
  });
}

export type RuntimeSetupReadiness = {
  configured: boolean;
  preflightCompatible: boolean;
  runnerReady: boolean;
  revision: number;
  prerequisites: string[];
  warnings: string[];
  applications: string[];
  mappings: string[];
  detectedServices: string[];
  runnerIssues: string[];
  topology: Record<string, unknown> | null;
};

export function useRuntimeSetupReadiness(projectId: string | null) {
  const client = useApi();
  return useQuery({
    queryKey: ["api", "runtime-setup-readiness", projectId],
    queryFn: ({ signal }) =>
      courseApi<RuntimeSetupReadiness>(
        `analyzer/projects/${projectId}/runtime-setup-readiness`,
        { signal },
      ),
    enabled: client.mode === "backend" && !!projectId,
    refetchOnWindowFocus: true,
  });
}

export function CourseEnrollment({
  destination = "workspaces",
}: {
  destination?: "workspaces" | "roadmap";
}) {
  const t = useCourseText();
  const client = useApi();
  const router = useRouter();
  const cache = useQueryClient();
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const redeem = useMutation({
    mutationFn: (id: string) =>
      courseApi<{ workspaceId: string }>("course-enrollments/redeem", {
        method: "POST",
        headers: { "Idempotency-Key": id },
        body: JSON.stringify({ code: code.trim() }),
      }),
    onSuccess: ({ workspaceId }) => {
      setCode("");
      setRequestId(undefined);
      void cache.invalidateQueries({ queryKey: ["api", "workspaces"] });
      router.push(`/${destination}?workspace=${encodeURIComponent(workspaceId)}`);
    },
  });
  if (client.mode !== "backend") return null;
  const status = redeem.error instanceof ApiError ? redeem.error.status : undefined;
  return (
    <DetailPanel title={t("Join a class", "Tham gia lớp học")}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const id = requestId ?? crypto.randomUUID();
          setRequestId(id);
          redeem.mutate(id);
        }}
      >
        <FormField label="Passkey">
          {(props) => (
            <Input
              {...props}
              required
              pattern="[A-Za-z0-9_\-]{22}"
              maxLength={22}
              autoComplete="off"
              spellCheck={false}
              disabled={redeem.isPending}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.trim());
                setRequestId(undefined);
                redeem.reset();
              }}
            />
          )}
        </FormField>
        <Button disabled={redeem.isPending}>
          {redeem.isPending ? t("Joining…", "Đang tham gia…") : t("Join class", "Vào lớp")}
        </Button>
      </form>
      {redeem.error && (
        <p role="alert" className="text-sm text-destructive">
          {status === 409
            ? t(
                "Check My Workspaces. You may already be enrolled.",
                "Hãy kiểm tra Lớp của tôi. Bạn có thể đã ghi danh.",
              )
            : status === 400 || status === 422
              ? t(
                  "The Passkey is invalid or expired. Ask your lecturer for a current key.",
                  "Passkey không hợp lệ hoặc đã hết hạn. Hãy xin mã mới từ giảng viên.",
                )
              : t(
                  "Could not join the class. Please retry.",
                  "Chưa thể tham gia lớp. Vui lòng thử lại.",
                )}
        </p>
      )}
    </DetailPanel>
  );
}

export function CourseRoadmap({
  workspaceId,
  canManage,
  active,
}: {
  workspaceId: string;
  canManage: boolean;
  active: boolean;
}) {
  const t = useCourseText();
  const roadmap = useCourseRoadmap(workspaceId);
  if (roadmap.isError) {
    return (
      <Button variant="outline" onClick={() => void roadmap.refetch()}>
        {t("Retry loading lab roadmap", "Tải lại lộ trình Lab")}
      </Button>
    );
  }
  if (!roadmap.data?.guided) return null;
  const statusLabels = {
    ENROLLED: t("Enrolled", "Đã ghi danh"),
    IN_PROGRESS: t("In progress", "Đang học"),
    COMPLETED: t("Completed", "Đã hoàn thành"),
  };
  const passed = roadmap.data.labs.filter((lab) => lab.state === "PASSED").length;
  const total = roadmap.data.labs.length;
  const progress = total ? Math.round((passed / total) * 100) : 0;
  return (
    <DetailPanel title={t("Lab roadmap", "Lộ trình Lab")}>
      {roadmap.data.enrollmentStatus && (
        <p className="text-sm font-medium">{statusLabels[roadmap.data.enrollmentStatus]}</p>
      )}
      <div className="space-y-2" aria-label={t("Course progress", "Tiến độ khóa học")}>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{t("Course progress", "Tiến độ khóa học")}</span>
          <span>
            {passed}/{total} {t("Labs passed", "Lab đã đạt")}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ol className="space-y-2">
        {roadmap.data.labs.map((lab) => (
          <li
            key={lab.assignmentId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                Lab {lab.position} · {lab.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {lab.state === "PASSED"
                  ? t("Passed", "Đã đạt")
                  : lab.state === "UNLOCKED"
                    ? t("Available", "Đã mở")
                    : lab.reason === "COURSE_ARCHIVED"
                      ? t("Class archived", "Lớp đã lưu trữ")
                      : t("Pass the preceding labs to unlock.", "Đạt các Lab trước để mở khóa.")}
              </p>
            </div>
            {active && lab.state !== "LOCKED" && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.assignmentId)}&step=1`}
                >
                  {t("Open lab", "Mở Lab")}
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
      {canManage && active && (
        <div id="course-passkey">
          <CoursePasskey workspaceId={workspaceId} />
        </div>
      )}
    </DetailPanel>
  );
}

function CoursePasskey({ workspaceId }: { workspaceId: string }) {
  const t = useCourseText();
  const cache = useQueryClient();
  const path = `workspaces/${workspaceId}/course-passkey`;
  const [validHours, setValidHours] = useState(24);
  const [maxStudents, setMaxStudents] = useState(30);
  const [issued, setIssued] = useState<IssuedKey>();
  const [copied, setCopied] = useState(false);
  const status = useQuery({
    queryKey: passkeyKey(workspaceId),
    queryFn: ({ signal }) => courseApi<KeyStatus>(path, { signal }),
  });
  const change = useMutation<IssuedKey | null, Error, "issue" | "revoke">({
    mutationFn: (action: "issue" | "revoke") =>
      action === "issue"
        ? courseApi<IssuedKey>(path, {
            method: "POST",
            body: JSON.stringify({ validHours, maxStudents }),
          })
        : courseApi<null>(`${path}/revoke`, { method: "POST" }),
    onSuccess: (key) => {
      setIssued(key ?? undefined);
      setCopied(false);
      void cache.invalidateQueries({ queryKey: passkeyKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{t("Class Passkey", "Passkey của lớp")}</h3>
      {status.data?.active && status.data.expiresAt && (
        <p className="text-sm text-muted-foreground">
          {t("Expires", "Hết hạn")}{" "}
          <time dateTime={status.data.expiresAt}>
            {new Date(status.data.expiresAt).toLocaleString()}
          </time>
        </p>
      )}
      {status.data && (
        <p className="text-sm text-muted-foreground">
          {t("Enrollment", "Ghi danh")}: {status.data.enrolledStudents}/
          {status.data.maxStudents ?? t("Unlimited", "Không giới hạn")}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !status.data?.active ||
            window.confirm(t("Replace the active Passkey?", "Thay Passkey đang có hiệu lực?"))
          )
            change.mutate("issue");
        }}
      >
        <FormField label={t("Valid for (hours)", "Hiệu lực (giờ)")}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={168}
              required
              value={validHours || ""}
              onChange={(event) => setValidHours(Number(event.target.value))}
            />
          )}
        </FormField>
        <FormField label={t("Maximum students", "Sĩ số tối đa")}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={10000}
              required
              value={maxStudents || ""}
              onChange={(event) => setMaxStudents(Number(event.target.value))}
            />
          )}
        </FormField>
        <Button disabled={change.isPending || !status.data}>
          {status.data?.active
            ? t("Replace Passkey", "Đổi Passkey")
            : t("Issue Passkey", "Cấp Passkey")}
        </Button>
        {status.data?.active && (
          <Button
            type="button"
            variant="outline"
            disabled={change.isPending}
            onClick={() => {
              if (window.confirm(t("Revoke this Passkey?", "Thu hồi Passkey này?")))
                change.mutate("revoke");
            }}
          >
            {t("Revoke", "Thu hồi")}
          </Button>
        )}
      </form>
      {issued && (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <code className="select-all rounded bg-muted px-2 py-1">{issued.code}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(issued.code).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? t("Copied", "Đã sao chép") : t("Copy", "Sao chép")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("Copy the key before leaving this page.", "Hãy sao chép mã trước khi rời trang.")}
          </span>
        </div>
      )}
      {status.isError && (
        <Button type="button" variant="outline" onClick={() => void status.refetch()}>
          {t("Retry loading Passkey", "Tải lại Passkey")}
        </Button>
      )}
      {change.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            "Could not update the Passkey. Please retry.",
            "Chưa thể cập nhật Passkey. Vui lòng thử lại.",
          )}
        </p>
      )}
    </div>
  );
}

export function PublishCourseLab({
  workspaceId,
  assignmentId,
  position,
}: {
  workspaceId: string;
  assignmentId: string;
  position?: number | undefined;
}) {
  const t = useCourseText();
  const cache = useQueryClient();
  const publish = useMutation({
    mutationFn: () =>
      courseApi<Lab>(`workspaces/${workspaceId}/course-labs/${assignmentId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: roadmapKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "assignments"] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  const freeze = useMutation({
    mutationFn: () =>
      courseApi<Lab>(`workspaces/${workspaceId}/course-labs/${assignmentId}/freeze-topology`, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: roadmapKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
  });
  const labPosition = position ?? publish.data?.position;
  if (labPosition)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          Lab {labPosition} · {t("Published", "Đã công bố")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={freeze.isPending}
          onClick={() => freeze.mutate()}
        >
          {freeze.isPending
            ? t("Freezing…", "Đang đóng băng…")
            : t("Freeze Studio topology", "Đóng băng topology Studio")}
        </Button>
        {freeze.isSuccess && (
          <span role="status" className="text-xs text-success">
            {t("Topology frozen", "Đã đóng băng topology")}
          </span>
        )}
        {freeze.error && (
          <span role="alert" className="text-xs text-destructive">
            {freeze.error.message}
          </span>
        )}
      </div>
    );
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        disabled={publish.isPending}
        onClick={() => {
          if (
            window.confirm(
              t(
                "Publish this assignment as the next lab? Students will follow the published order and use its assigned source.",
                "Công bố assignment này làm Lab tiếp theo? Sinh viên sẽ học theo thứ tự công bố và sử dụng nguồn đã gán.",
              ),
            )
          )
            publish.mutate();
        }}
      >
        {t("Publish as lab", "Công bố Lab")}
      </Button>
      {publish.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            "Could not publish. Check the assigned source and class status.",
            "Chưa thể công bố. Hãy kiểm tra nguồn mẫu và trạng thái lớp.",
          )}
        </p>
      )}
    </div>
  );
}

export function SeedCuratedCourseLabs({
  workspaceId,
  variant = "outline",
}: {
  workspaceId: string;
  variant?: "default" | "outline";
}) {
  const t = useCourseText();
  const cache = useQueryClient();
  const [activePreset, setActivePreset] = useState<"STANDARD_DEMO" | "FULL_CURRICULUM" | null>(null);
  const seed = useMutation({
    mutationFn: (preset: "STANDARD_DEMO" | "FULL_CURRICULUM") => {
      setActivePreset(preset);
      return courseApi<Roadmap>(`workspaces/${workspaceId}/course-labs/seed-curated`, {
        method: "POST",
        body: JSON.stringify({ preset }),
      });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: roadmapKey(workspaceId) });
      void cache.invalidateQueries({ queryKey: ["api", "assignments"] });
      void cache.invalidateQueries({ queryKey: ["api", "projects"] });
      void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
    },
    onSettled: () => setActivePreset(null),
  });
  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={variant}
          disabled={seed.isPending}
          onClick={() => seed.mutate("STANDARD_DEMO")}
        >
          {seed.isPending && activePreset === "STANDARD_DEMO"
            ? t("Seeding Curated Labs…", "Đang khởi tạo Bộ Lab Chuẩn…")
            : t(
                "⚡ 1-Click Seed Curated Labs (Lab 01–03)",
                "⚡ Khởi tạo nhanh Bộ Lab Chuẩn (Lab 01–03)",
              )}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={seed.isPending}
          onClick={() => seed.mutate("FULL_CURRICULUM")}
        >
          {seed.isPending && activePreset === "FULL_CURRICULUM"
            ? t("Seeding Full 13-Lab Curriculum…", "Đang khởi tạo 13 Lab Giáo trình…")
            : t(
                "📚 Seed Full 12 Java + 1 C# Curriculum",
                "📚 Khởi tạo trọn bộ 13 Lab (12 Java + 1 C#)",
              )}
        </Button>
      </div>
      {seed.isSuccess && (
        <p role="status" className="text-xs text-success">
          {t(
            `Ready (${seed.data.labs.length} guided labs published).`,
            `Đã sẵn sàng (${seed.data.labs.length} Lab tuần tự đã công bố).`,
          )}
        </p>
      )}
      {seed.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t(
            "Could not seed curated labs. Verify workspace status and lecturer permissions.",
            "Chưa thể khởi tạo Lab mẫu. Hãy kiểm tra trạng thái lớp và quyền giảng viên.",
          )}
        </p>
      )}
    </div>
  );
}
