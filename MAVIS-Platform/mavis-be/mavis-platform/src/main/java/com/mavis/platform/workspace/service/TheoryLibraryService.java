package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.LabTheoryAsset;
import com.mavis.common.entity.TheoryAsset;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.CourseDefinitionRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.LabTheoryAssetRepository;
import com.mavis.common.repository.TheoryAssetRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Workspace-level theory library: reusable lessons linked to Labs instead of copied per Lab.
 *
 * <p>Attaching an asset materializes one THEORY item into the Lab's Course module so students read
 * it through the immutable published Course snapshot. Editing the asset re-syncs every linked Course
 * item, which keeps "write once, use in many Labs" true without breaking snapshot history.</p>
 */
@Service
@RequiredArgsConstructor
public class TheoryLibraryService {

    private static final Set<String> STYLES = Set.of("CONCEPT", "GUIDED", "CHECKLIST", "CUSTOM");
    private static final Set<String> SOURCES = Set.of("SEED", "LECTURER", "IMPORT", "AI", "BUNDLE");
    private static final int MAX_BODY = 50_000;
    private static final int MAX_EVIDENCE = 20;

    private final TheoryAssetRepository assets;
    private final LabTheoryAssetRepository links;
    private final AssignmentRepository assignments;
    private final WorkspaceRepository workspaces;
    private final CourseDefinitionRepository courses;
    private final EvidenceRepository evidence;
    private final AccessPolicyService access;
    private final CourseAuthoringService authoring;
    private final LlmTheoryDraftGenerator generator;
    private final JdbcTemplate jdbc;

    public record AssetView(UUID id, String title, String body, String language, String style,
                            String source, String sourceUrl, String licenseNote, int version,
                            OffsetDateTime updatedAt, String createdByName) {}

    public record ReusableAssetView(UUID id, UUID sourceWorkspaceId, String sourceWorkspaceName, String title,
                                    String body, String language, String style, String source,
                                    OffsetDateTime updatedAt) {}

    public record Upsert(String title, String body, String language, String style, String source,
                         String sourceUrl, String licenseNote) {}

    public record Attached(UUID assetId, String title, String style, String source, UUID courseItemId) {}

    public record GenerateRequest(String topic, String language, String style) {}

    public record Draft(String title, String body, String providerMode, int evidenceCount) {}

    @Transactional(readOnly = true)
    public List<AssetView> list(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        return assets.findByWorkspaceIdOrderByUpdatedAtDesc(workspaceId).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public List<ReusableAssetView> reusable(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        User actor = access.requireCurrentActiveUser();
        boolean isAdmin = actor != null && actor.getRole() != null
                && "SYSTEM_ADMIN".equalsIgnoreCase(actor.getRole().getCode());
        if (isAdmin) {
            return jdbc.query("""
                    SELECT ta.id, ta.workspace_id, COALESCE(w.name, 'Workspace'), ta.title, ta.body,
                           ta.language, ta.style, ta.source, ta.updated_at
                    FROM theory_assets ta
                    JOIN workspaces w ON w.id = ta.workspace_id
                    WHERE ta.workspace_id <> ?
                    ORDER BY ta.updated_at DESC
                    LIMIT 50
                    """, (rs, row) -> new ReusableAssetView(
                    rs.getObject(1, UUID.class),
                    rs.getObject(2, UUID.class),
                    rs.getString(3),
                    rs.getString(4),
                    rs.getString(5),
                    rs.getString(6),
                    rs.getString(7),
                    rs.getString(8),
                    rs.getObject(9, OffsetDateTime.class)), workspaceId);
        }
        UUID actorId = actor == null ? null : actor.getId();
        return jdbc.query("""
                SELECT DISTINCT ta.id, ta.workspace_id, COALESCE(w.name, 'Workspace'), ta.title, ta.body,
                       ta.language, ta.style, ta.source, ta.updated_at
                FROM theory_assets ta
                JOIN workspaces w ON w.id = ta.workspace_id
                LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.member_role = 'LECTURER'
                WHERE ta.workspace_id <> ?
                  AND (ta.created_by = ? OR w.created_by = ? OR wm.user_id IS NOT NULL)
                ORDER BY ta.updated_at DESC
                LIMIT 50
                """, (rs, row) -> new ReusableAssetView(
                rs.getObject(1, UUID.class),
                rs.getObject(2, UUID.class),
                rs.getString(3),
                rs.getString(4),
                rs.getString(5),
                rs.getString(6),
                rs.getString(7),
                rs.getString(8),
                rs.getObject(9, OffsetDateTime.class)), actorId, workspaceId, actorId, actorId);
    }

    @Transactional
    public AssetView create(UUID workspaceId, Upsert request) {
        access.requireWorkspaceLecturer(workspaceId);
        Parts parts = validate(request);
        Workspace workspace = workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        User actor = access.requireCurrentActiveUser();
        TheoryAsset asset = assets.save(TheoryAsset.builder()
                .workspace(workspace)
                .createdBy(actor)
                .title(parts.title())
                .body(parts.body())
                .language(parts.language())
                .style(parts.style())
                .source(parts.source())
                .sourceUrl(parts.sourceUrl())
                .licenseNote(parts.licenseNote())
                .version(1)
                .build());
        return view(asset);
    }

    @Transactional
    public AssetView update(UUID workspaceId, UUID assetId, Upsert request) {
        access.requireWorkspaceLecturer(workspaceId);
        TheoryAsset asset = assets.findByIdAndWorkspaceId(assetId, workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "THEORY_ASSET_NOT_FOUND",
                        "Theory asset not found in this workspace"));
        Parts parts = validate(request);
        asset.setTitle(parts.title());
        asset.setBody(parts.body());
        asset.setLanguage(parts.language());
        asset.setStyle(parts.style());
        asset.setSource(parts.source());
        asset.setSourceUrl(parts.sourceUrl());
        asset.setLicenseNote(parts.licenseNote());
        asset.setVersion(asset.getVersion() + 1);
        assets.save(asset);
        syncLinkedItems(asset);
        return view(asset);
    }

    @Transactional
    public void delete(UUID workspaceId, UUID assetId) {
        access.requireWorkspaceLecturer(workspaceId);
        TheoryAsset asset = assets.findByIdAndWorkspaceId(assetId, workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "THEORY_ASSET_NOT_FOUND",
                        "Theory asset not found in this workspace"));
        links.deleteAll(links.findByAssetId(assetId));
        assets.delete(asset);
    }

    @Transactional(readOnly = true)
    public List<Attached> attached(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        lab(workspaceId, assignmentId);
        return links.findByAssignmentIdOrderByPositionAsc(assignmentId).stream()
                .map(link -> new Attached(link.getAsset().getId(), link.getAsset().getTitle(),
                        link.getAsset().getStyle(), link.getAsset().getSource(), link.getCourseItemId()))
                .toList();
    }

    @Transactional
    public Attached attach(UUID workspaceId, UUID assignmentId, UUID assetId) {
        access.requireWorkspaceLecturer(workspaceId);
        Assignment lab = lab(workspaceId, assignmentId);
        TheoryAsset asset = assets.findByIdAndWorkspaceId(assetId, workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "THEORY_ASSET_NOT_FOUND",
                        "Theory asset not found in this workspace"));
        var existing = links.findByAssignmentIdAndAssetId(assignmentId, assetId).orElse(null);
        if (existing != null) {
            return new Attached(asset.getId(), asset.getTitle(), asset.getStyle(), asset.getSource(),
                    existing.getCourseItemId());
        }
        UUID moduleId = moduleForLab(workspaceId, lab);
        authoring.addItem(workspaceId, moduleId, new CourseAuthoringService.ItemRequest(
                "THEORY", asset.getTitle(), "Theory from the workspace library", lab.getId(),
                contentOf(asset), true));
        UUID itemId = jdbc.query("""
                SELECT id FROM course_items
                WHERE module_id = ? AND assignment_id = ? AND item_type = 'THEORY'
                ORDER BY position DESC LIMIT 1
                """, (rs, row) -> rs.getObject(1, UUID.class), moduleId, assignmentId)
                .stream().findFirst().orElse(null);
        LabTheoryAsset link = links.save(LabTheoryAsset.builder()
                .assignment(lab)
                .asset(asset)
                .courseItemId(itemId)
                .position(links.findByAssignmentIdOrderByPositionAsc(assignmentId).size() + 1)
                .attachedAt(OffsetDateTime.now())
                .build());
        return new Attached(asset.getId(), asset.getTitle(), asset.getStyle(), asset.getSource(),
                link.getCourseItemId());
    }

    @Transactional
    public void detach(UUID workspaceId, UUID assignmentId, UUID assetId) {
        access.requireWorkspaceLecturer(workspaceId);
        lab(workspaceId, assignmentId);
        LabTheoryAsset link = links.findByAssignmentIdAndAssetId(assignmentId, assetId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "THEORY_LINK_NOT_FOUND",
                        "This theory asset is not attached to the Lab"));
        if (link.getCourseItemId() != null) {
            ensureCourseDraft(workspaceId);
            jdbc.query("""
                    SELECT module_id FROM course_items WHERE id = ?
                    """, (rs, row) -> rs.getObject(1, UUID.class), link.getCourseItemId())
                    .stream().findFirst()
                    .ifPresent(moduleId -> authoring.deleteItem(workspaceId, moduleId, link.getCourseItemId()));
        }
        links.delete(link);
    }

    @Transactional(readOnly = true)
    public Draft generateDraft(UUID workspaceId, UUID assignmentId, GenerateRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        Assignment lab = lab(workspaceId, assignmentId);
        boolean vietnamese = request == null || request.language() == null || !"en".equalsIgnoreCase(request.language());
        String style = request == null || request.style() == null ? "CONCEPT" : request.style().toUpperCase(Locale.ROOT);
        if (!STYLES.contains(style)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_STYLE_INVALID", "Unsupported theory style");
        }
        String topic = request == null || request.topic() == null || request.topic().isBlank()
                ? lab.getTitle() : request.topic().trim();
        List<String> context = lab.getReferenceModel() == null ? List.of()
                : evidence.findByModelVersionId(lab.getReferenceModel().getId()).stream()
                        .limit(MAX_EVIDENCE)
                        .map(this::evidenceLine)
                        .filter(line -> !line.isBlank())
                        .toList();
        var draft = generator.generate(topic, vietnamese, style, context);
        return new Draft(draft.title(), draft.body(), draft.providerMode(), context.size());
    }

    private String evidenceLine(Evidence item) {
        String excerpt = redact(item.getExcerpt());
        if (excerpt.isBlank()) return "";
        StringBuilder line = new StringBuilder("[").append(item.getSourceType()).append("]");
        if (item.getLocator() != null && !item.getLocator().isBlank()) {
            line.append(" ").append(redact(item.getLocator()));
        }
        line.append(" — ").append(excerpt.length() > 300 ? excerpt.substring(0, 300) : excerpt);
        return line.toString();
    }

    private static String redact(String value) {
        if (value == null) return "";
        return value
                .replaceAll("(?i)(password|secret|token|api[-_]?key)\\s*[:=]\\s*\\S+", "$1=[redacted]")
                .replaceAll("sk-[A-Za-z0-9_-]{8,}", "[redacted-key]");
    }

    private void syncLinkedItems(TheoryAsset asset) {
        List<LabTheoryAsset> attached = links.findByAssetId(asset.getId());
        if (attached.isEmpty()) return;
        ensureCourseDraft(asset.getWorkspace().getId());
        for (LabTheoryAsset link : attached) {
            if (link.getCourseItemId() == null) continue;
            jdbc.query("""
                    SELECT module_id FROM course_items WHERE id = ?
                    """, (rs, row) -> rs.getObject(1, UUID.class), link.getCourseItemId())
                    .stream().findFirst()
                    .ifPresent(moduleId -> authoring.updateItem(link.getAssignment().getWorkspace().getId(),
                            moduleId, link.getCourseItemId(), new CourseAuthoringService.ItemRequest(
                                    "THEORY", asset.getTitle(), "Theory from the workspace library",
                                    link.getAssignment().getId(), contentOf(asset), true)));
        }
    }

    private com.fasterxml.jackson.databind.node.ObjectNode contentOf(TheoryAsset asset) {
        var content = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        content.put("body", asset.getBody());
        content.put("format", "markdown");
        content.put("theoryAssetId", asset.getId().toString());
        content.put("theoryAssetVersion", asset.getVersion());
        return content;
    }

    private UUID moduleForLab(UUID workspaceId, Assignment lab) {
        ensureCourseDraft(workspaceId);
        UUID moduleId = jdbc.query("""
                SELECT cm.id FROM course_modules cm
                JOIN course_items ci ON ci.module_id = cm.id
                WHERE ci.assignment_id = ?
                ORDER BY cm.position LIMIT 1
                """, (rs, row) -> rs.getObject(1, UUID.class), lab.getId())
                .stream().findFirst().orElse(null);
        if (moduleId != null) return moduleId;
        String labModuleTitle = "Lab · " + (lab.getTitle() == null ? "Theory" : lab.getTitle());
        moduleId = jdbc.query("""
                SELECT cm.id FROM course_modules cm
                WHERE cm.course_id = (SELECT id FROM course_definitions WHERE workspace_id = ?)
                  AND cm.title = ?
                ORDER BY cm.position LIMIT 1
                """, (rs, row) -> rs.getObject(1, UUID.class), workspaceId, labModuleTitle)
                .stream().findFirst().orElse(null);
        if (moduleId != null) return moduleId;
        moduleId = jdbc.query("""
                SELECT cm.id FROM course_modules cm
                WHERE cm.course_id = (SELECT id FROM course_definitions WHERE workspace_id = ?)
                  AND cm.title NOT LIKE 'Lab · %'
                  AND NOT EXISTS (
                      SELECT 1 FROM course_items ci
                      WHERE ci.module_id = cm.id AND ci.assignment_id IS NOT NULL AND ci.assignment_id <> ?
                  )
                ORDER BY cm.position LIMIT 1
                """, (rs, row) -> rs.getObject(1, UUID.class), workspaceId, lab.getId())
                .stream().findFirst().orElse(null);
        if (moduleId != null) return moduleId;
        var created = authoring.addModule(workspaceId, new CourseAuthoringService.ModuleRequest(
                labModuleTitle, null, null));
        return created.modules().getLast().id();
    }

    private void ensureCourseDraft(UUID workspaceId) {
        var course = courses.findByWorkspaceId(workspaceId).orElse(null);
        if (course == null) {
            Workspace workspace = workspaces.findById(workspaceId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
            authoring.saveDraft(workspaceId, new CourseAuthoringService.CourseRequest(
                    workspace.getName() + " Course", "Theory library material"));
            return;
        }
        if ("PUBLISHED".equals(course.getStatus())) authoring.startDraft(workspaceId);
    }

    private Assignment lab(UUID workspaceId, UUID assignmentId) {
        return assignments.findById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "LAB_NOT_FOUND",
                        "Lab not found in this workspace"));
    }

    private Parts validate(Upsert request) {
        if (request == null || request.title() == null || request.title().isBlank()
                || request.title().trim().length() > 255) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID",
                    "Theory title is required and must be at most 255 characters");
        }
        if (request.body() == null || request.body().isBlank() || request.body().length() > MAX_BODY) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID",
                    "Theory body is required and must be at most " + MAX_BODY + " characters");
        }
        String language = request.language() == null || request.language().isBlank()
                ? "vi" : request.language().trim().toLowerCase(Locale.ROOT);
        if (language.length() > 16) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID", "Unsupported language");
        }
        String style = request.style() == null || request.style().isBlank()
                ? "CUSTOM" : request.style().trim().toUpperCase(Locale.ROOT);
        if (!STYLES.contains(style)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID", "Unsupported theory style");
        }
        String source = request.source() == null || request.source().isBlank()
                ? "LECTURER" : request.source().trim().toUpperCase(Locale.ROOT);
        if (!SOURCES.contains(source)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID", "Unsupported theory source");
        }
        if (request.sourceUrl() != null && request.sourceUrl().length() > 1024) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID", "Source URL is too long");
        }
        if (request.licenseNote() != null && request.licenseNote().length() > 255) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ASSET_INVALID", "License note is too long");
        }
        return new Parts(request.title().trim(), request.body().trim(), language, style, source,
                blankToNull(request.sourceUrl()), blankToNull(request.licenseNote()));
    }

    private AssetView view(TheoryAsset asset) {
        return new AssetView(asset.getId(), asset.getTitle(), asset.getBody(), asset.getLanguage(),
                asset.getStyle(), asset.getSource(), asset.getSourceUrl(), asset.getLicenseNote(),
                asset.getVersion(), asset.getUpdatedAt(),
                asset.getCreatedBy() == null ? null : asset.getCreatedBy().getFullName());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record Parts(String title, String body, String language, String style, String source,
                         String sourceUrl, String licenseNote) {}
}
