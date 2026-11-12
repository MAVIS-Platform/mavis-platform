"use client";
import Link from "next/link";
import { useState } from "react";
import { useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { SearchInput, SelectField } from "@/components/shared/forms";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { CreateWorkspace, WorkspaceControls } from "./manage";
import { CourseEnrollment, CourseRoadmap } from "./course-access";
import { ReferenceManagement } from "./reference-manage";
export function Workspaces() {
  const query = useApiQuery("workspaces", {});
  const session = useSession();
  const { workspaceId } = useSelection();
  const canCreate = ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  const selected = query.data?.find((w) => w.id === workspaceId);
  if (workspaceId && selected) return <WorkspaceOverview />;
  return (
    <>
      <CreateWorkspace />
      {session.data?.user?.role === "student" && <CourseEnrollment />}
      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={
          canCreate
            ? "You have no teaching workspaces yet. Create a class above, then add students by their registered email."
            : "You are not enrolled in a class yet. Ask your lecturer for a Passkey."
        }
      >
        {!canCreate && (
          <p className="text-sm text-muted-foreground">
            Select a class under My Workspaces in the left sidebar to view class information.
          </p>
        )}
      </RequestState>
    </>
  );
}
export function WorkspaceOverview() {
  const { workspaceId } = useSelection();
  const session = useSession();
  const query = useApiQuery("workspaces", {});
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const workspace = query.data?.find((w) => w.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const members = workspace?.members ?? [];
  const studentCount = members.filter((m) => m.role.toUpperCase() === "STUDENT").length;
  const lecturerCount = members.filter((m) => m.role.toUpperCase() === "LECTURER").length;
  const assignmentList = assignments.data ?? [];
  const withSourceCount = assignmentList.filter((a) => Boolean(a.referenceSource)).length;
  const withDeadlineCount = assignmentList.filter(
    (a) => a.dueAt && a.dueAt !== "No deadline",
  ).length;
  return (
    <RequestState query={query} empty={!workspace}>
      {workspace && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-semibold text-foreground">{workspace.name}</h2>
                {workspace.code && <StatusBadge status={workspace.code} preserveCase />}
                <StatusBadge
                  status={workspace.status ?? "ACTIVE"}
                  variant={workspace.status === "ARCHIVED" ? "secondary" : "default"}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {workspace.description || "No class description added yet."}
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href={`/assignments?workspace=${encodeURIComponent(workspace.id)}`}>
                    Manage Assignments
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <CourseRoadmap
            key={workspace.id}
            workspaceId={workspace.id}
            canManage={canManage}
            active={workspace.status !== "ARCHIVED"}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Class code"
              value={workspace.code || "—"}
              description={`Status: ${workspace.status ?? "ACTIVE"}`}
            />
            <SummaryCard
              label="Students enrolled"
              value={studentCount}
              description={`${lecturerCount} lecturer(s) · ${members.length} total members`}
            />
            <SummaryCard
              label="Published assignments"
              value={assignmentList.length}
              description={`${withSourceCount} with reference source attached`}
            />
            <SummaryCard
              label="Scheduled deadlines"
              value={withDeadlineCount}
              description={`${assignmentList.length - withDeadlineCount} without deadline`}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <DetailPanel title="Class assignments">
              <DataTable
                rows={assignmentList}
                rowKey={(a) => a.id}
                caption="Class assignments"
                columns={[
                  {
                    key: "title",
                    label: "Assignment",
                    render: (a) => (
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`/assignments?workspace=${encodeURIComponent(workspace.id)}#assignment-${a.id}`}
                      >
                        {a.title}
                      </Link>
                    ),
                  },
                  { key: "due", label: "Deadline", render: (a) => a.dueAt },
                  {
                    key: "diagrams",
                    label: "Required views",
                    render: (a) => a.requiredDiagramTypes?.length || "Any",
                  },
                  {
                    key: "source",
                    label: "Reference source",
                    render: (a) => (a.referenceSource ? "Attached" : "Student project"),
                  },
                  {
                    key: "action",
                    label: "Action",
                    render: (a) => (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/assignments?workspace=${encodeURIComponent(workspace.id)}#assignment-${a.id}`}
                        >
                          {canManage ? "Review" : "Open & Submit →"}
                        </Link>
                      </Button>
                    ),
                  },
                ]}
              />
            </DetailPanel>
            {canManage ? (
              <DetailPanel title="Class settings">
                <WorkspaceControls key={workspace.id} workspace={workspace} mode="overview" />
              </DetailPanel>
            ) : (
              <DetailPanel title="How to complete & submit coursework">
                <div className="space-y-4 text-sm">
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Open Assignment</p>
                      <p className="text-muted-foreground">
                        Click <strong>Open & Submit →</strong> on an assignment to read
                        instructions, required diagram types, and any attached reference source.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        Create & Analyze Coursework Project
                      </p>
                      <p className="text-muted-foreground">
                        Create a project for the assignment, import your GitHub repository or ZIP
                        (or clone the Lecturer&apos;s reference source), and run static analysis.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        Review Architecture & Save Diagrams
                      </p>
                      <p className="text-muted-foreground">
                        Inspect the Architecture Graph, C4/UML Diagrams, 3E Inspector, and Change
                        Impact. Save your required diagram views.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Freeze & Submit</p>
                      <p className="text-muted-foreground">
                        Return to the assignment, select your Model Version and diagrams, and submit
                        before the deadline.
                      </p>
                    </div>
                  </div>
                </div>
              </DetailPanel>
            )}
          </div>
        </div>
      )}
    </RequestState>
  );
}
export function WorkspaceMembers() {
  const { workspaceId } = useSelection();
  const session = useSession();
  const query = useApiQuery("workspaces", {});
  const remove = useApiMutation("removeWorkspaceMember");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const workspace = query.data?.find((w) => w.id === workspaceId);
  const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";
  const filteredMembers = (workspace?.members ?? []).filter((m) => {
    const matchesSearch =
      !search.trim() ||
      m.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      m.role.toLowerCase().includes(search.trim().toLowerCase());
    const matchesRole = roleFilter === "ALL" || m.role.toUpperCase() === roleFilter;
    return matchesSearch && matchesRole;
  });
  return (
    <RequestState query={query} empty={!workspace}>
      <div className="space-y-4">
        {workspace && canManage && (
          <div className="rounded-xl border bg-card p-4">
            <WorkspaceControls key={workspace.id} workspace={workspace} mode="members" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <SearchInput label="Filter members" value={search} onChange={setSearch} />
          <SelectField
            label="Role"
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: "ALL", label: "All roles" },
              { value: "STUDENT", label: "Student" },
              { value: "LECTURER", label: "Lecturer" },
            ]}
          />
        </div>
        {remove.error && <ErrorState error={remove.error} />}
        <DataTable
          rows={filteredMembers}
          rowKey={(m) => m.id}
          caption="Workspace members"
          columns={[
            { key: "name", label: "Name", render: (m) => m.name },
            { key: "role", label: "Role", render: (m) => m.role },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    label: "Actions",
                    render: (m: { id: string; name: string; role: string }) =>
                      workspace &&
                      m.id !== workspace.createdById &&
                      m.id !== session.data?.user?.id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${m.name} from this class?`))
                              remove.mutate({ workspaceId: workspace.id, userId: m.id });
                          }}
                        >
                          Remove
                        </Button>
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </RequestState>
  );
}
export function ReferenceVersions() {
  const { workspaceId } = useSelection();
  const query = useApiQuery(
    "referenceVersions",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  return workspaceId ? (
    <div className="space-y-5">
      <ReferenceManagement key={workspaceId} workspaceId={workspaceId} />
      <RequestState query={query} empty={!query.data?.length}>
        {query.data?.map((reference) => (
          <DetailPanel key={reference.id} title={reference.snapshot.name}>
            <p className="break-all text-sm text-muted-foreground">
              Reference source {reference.snapshot.id} · model {reference.model.id} · revision{" "}
              {reference.model.revision}
            </p>
            <DataTable
              rows={reference.model.elements}
              rowKey={(e) => e.id}
              caption="Reference architecture elements"
              columns={[
                { key: "name", label: "Element", render: (e) => e.name },
                { key: "description", label: "Description", render: (e) => e.description },
              ]}
            />
          </DetailPanel>
        ))}
      </RequestState>
    </div>
  ) : null;
}
