package com.mavis.platform.workspace.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Explicit unlock prerequisites between published Labs.
 *
 * <p>Labs without configured prerequisites keep the historical sequential rule (the preceding Lab
 * by {@code lab_order}). Configuring a prerequisite list replaces that rule for that Lab only.</p>
 */
@Service
@RequiredArgsConstructor
public class LabPrerequisiteService {

    private final JdbcTemplate jdbc;
    private final AssignmentRepository assignments;
    private final AccessPolicyService access;

    public record LabPrerequisite(UUID assignmentId, List<UUID> prerequisiteAssignmentIds) {}

    public record ReplaceRequest(List<UUID> prerequisiteAssignmentIds) {}

    @Transactional(readOnly = true)
    public List<LabPrerequisite> list(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        List<UUID> labs = jdbc.queryForList("""
                SELECT id FROM assignments
                WHERE workspace_id = ? AND lab_order IS NOT NULL
                ORDER BY lab_order
                """, UUID.class, workspaceId);
        Map<UUID, List<UUID>> graph = graph(workspaceId);
        List<LabPrerequisite> result = new ArrayList<>();
        for (UUID labId : labs) {
            result.add(new LabPrerequisite(labId, graph.getOrDefault(labId, List.of())));
        }
        return result;
    }

    @Transactional
    public LabPrerequisite replace(UUID workspaceId, UUID assignmentId, List<UUID> requested) {
        access.requireWorkspaceLecturer(workspaceId);
        labInWorkspace(workspaceId, assignmentId);
        List<UUID> prerequisites = requested == null ? List.of() : requested.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (prerequisites.contains(assignmentId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "A Lab cannot be its own prerequisite");
        }
        for (UUID prerequisiteId : prerequisites) {
            labInWorkspace(workspaceId, prerequisiteId);
        }
        Map<UUID, List<UUID>> graph = graph(workspaceId);
        graph.put(assignmentId, prerequisites);
        if (hasCycle(graph)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_PREREQUISITE_CYCLE",
                    "These prerequisites create a cycle");
        }
        jdbc.update("DELETE FROM lab_prerequisites WHERE assignment_id = ?", assignmentId);
        for (UUID prerequisiteId : prerequisites) {
            jdbc.update("""
                    INSERT INTO lab_prerequisites(assignment_id, prerequisite_assignment_id)
                    VALUES (?, ?)
                    """, assignmentId, prerequisiteId);
        }
        return new LabPrerequisite(assignmentId, prerequisites);
    }

    private UUID labInWorkspace(UUID workspaceId, UUID assignmentId) {
        return assignments.findById(assignmentId)
                .filter(lab -> workspaceId.equals(lab.getWorkspace().getId()))
                .filter(lab -> lab.getLabOrder() != null)
                .map(lab -> lab.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "LAB_PREREQUISITE_INVALID",
                        "Every prerequisite must be a published Lab in this workspace"));
    }

    private Map<UUID, List<UUID>> graph(UUID workspaceId) {
        Map<UUID, List<UUID>> graph = new LinkedHashMap<>();
        jdbc.query("""
                SELECT id FROM assignments
                WHERE workspace_id = ? AND lab_order IS NOT NULL
                """, (rs, row) -> rs.getObject(1, UUID.class), workspaceId)
                .forEach(id -> graph.put(id, new ArrayList<>()));
        jdbc.query("""
                SELECT lp.assignment_id, lp.prerequisite_assignment_id
                FROM lab_prerequisites lp
                JOIN assignments a ON a.id = lp.assignment_id
                WHERE a.workspace_id = ?
                """, (rs, row) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)},
                workspaceId)
                .forEach(row -> graph.computeIfAbsent((UUID) row[0], key -> new ArrayList<>())
                        .add((UUID) row[1]));
        return graph;
    }

    private boolean hasCycle(Map<UUID, List<UUID>> graph) {
        Set<UUID> visiting = new HashSet<>();
        Set<UUID> visited = new HashSet<>();
        for (UUID node : graph.keySet()) {
            if (visit(node, graph, visiting, visited)) return true;
        }
        return false;
    }

    private boolean visit(UUID node, Map<UUID, List<UUID>> graph, Set<UUID> visiting, Set<UUID> visited) {
        if (visited.contains(node)) return false;
        if (!visiting.add(node)) return true;
        for (UUID next : graph.getOrDefault(node, List.of())) {
            if (visit(next, graph, visiting, visited)) return true;
        }
        visiting.remove(node);
        visited.add(node);
        return false;
    }
}
