export type GradebookLab = {
  assignmentId: string;
  title: string;
  labOrder: number | null;
  sequenceOrder?: number | null | undefined;
  published?: boolean | undefined;
  quizPassScore?: number | null | undefined;
  labMode?: string | undefined;
};

export type GradebookCell = {
  assignmentId: string;
  quizBestScore: number | null;
  quizPassed: boolean;
  submissionId: string | null;
  submittedAt: string | null;
  reviewStatus: string | null;
  reviewScore: number | null;
  reviewScoreTenScale?: number | null;
  labOutcome: string | null;
};

export type GradebookStudent = {
  studentId: string;
  userId?: string | undefined;
  fullName: string;
  email: string;
  passedLabs: number;
  completedLabsCount?: number | undefined;
  totalLabsCount?: number | undefined;
  averageScore: number | null;
  averageScoreTenScale?: number | null;
  cells: GradebookCell[];
};

export type WorkspaceGradebook = {
  workspaceId: string;
  workspaceName: string;
  labs: GradebookLab[];
  students: GradebookStudent[];
};

type RawGradebookLab = Partial<GradebookLab> & { sequenceOrder?: number | null };
type RawGradebookStudent = Partial<GradebookStudent> & {
  userId?: string;
  completedLabsCount?: number;
  totalLabsCount?: number;
};
type RawWorkspaceGradebook = {
  workspaceId?: string;
  workspaceName?: string;
  labs?: RawGradebookLab[];
  students?: RawGradebookStudent[];
};

/** Normalizes Java WorkspaceGradebookDTO field names (userId/completedLabsCount/sequenceOrder) to FE contract. */
export function normalizeWorkspaceGradebook(raw: unknown): WorkspaceGradebook {
  const payload = (raw && typeof raw === "object" ? raw : {}) as RawWorkspaceGradebook;
  const rawLabs = Array.isArray(payload.labs) ? payload.labs : [];
  const labs: GradebookLab[] = rawLabs.map((lab) => ({
    assignmentId: String(lab.assignmentId ?? ""),
    title: String(lab.title ?? ""),
    labOrder: lab.labOrder ?? lab.sequenceOrder ?? null,
    sequenceOrder: lab.sequenceOrder ?? lab.labOrder ?? null,
    published: lab.published,
    quizPassScore: lab.quizPassScore ?? null,
    labMode: lab.labMode ?? "GUIDED",
  }));
  const rawStudents = Array.isArray(payload.students) ? payload.students : [];
  const students: GradebookStudent[] = rawStudents.map((student) => {
    const passed = student.passedLabs ?? student.completedLabsCount ?? 0;
    const studentId = String(student.studentId ?? student.userId ?? "");
    return {
      studentId,
      userId: student.userId ?? studentId,
      fullName: String(student.fullName ?? ""),
      email: String(student.email ?? ""),
      passedLabs: Number.isFinite(passed) ? passed : 0,
      completedLabsCount: Number.isFinite(passed) ? passed : 0,
      totalLabsCount: student.totalLabsCount ?? labs.length,
      averageScore: student.averageScore ?? null,
      averageScoreTenScale: student.averageScoreTenScale ?? null,
      cells: Array.isArray(student.cells) ? student.cells : [],
    };
  });
  return {
    workspaceId: String(payload.workspaceId ?? ""),
    workspaceName: String(payload.workspaceName ?? ""),
    labs,
    students,
  };
}
