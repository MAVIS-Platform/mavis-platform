package com.mavis.analyzer.diagram.service.impl;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.exception.*;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.StringReader;
import java.time.OffsetDateTime;
import java.util.UUID;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.xml.sax.InputSource;

@Service @RequiredArgsConstructor
public class ArchitectureDocumentService {
    private final ModelVersionRepository models;
    private final ArchitectureDocumentRepository documents;
    private final AccessPolicyService access;
    private final EntityManager entityManager;
    private final DiagramVersionRepository diagrams;
    public record Document(UUID modelId,String viewId,long revision,String xml) {}
    public record Save(long expectedRevision,String xml) {}
    public record Revision(UUID modelId, String viewId, long revision, OffsetDateTime savedAt) {}
    public record SelectedDocument(String viewId, long revision) {}
    public record ArtifactSelection(java.util.List<SelectedDocument> documents, java.util.List<UUID> diagramVersionIds) {}
    @Transactional
    public UUID freezeArtifacts(UUID modelId, ArtifactSelection selection) {
        var model = model(modelId);
        access.requireProjectWriteAccess(model.getProject());
        if (selection == null) throw invalid();
        var docs = selection.documents() == null ? java.util.List.<SelectedDocument>of() : selection.documents();
        var versions = selection.diagramVersionIds() == null ? java.util.List.<UUID>of() : selection.diagramVersionIds();
        if (docs.size() + versions.size() < 1 || docs.size() + versions.size() > 20) throw invalid();

        var viewKeys = new java.util.LinkedHashSet<String>();
        var revisions = new java.util.HashSet<Long>();
        for (var doc : docs) {
            if (doc == null) throw invalid();
            validateKey(doc.viewId());
            if (!viewKeys.add(doc.viewId())) throw new BusinessException(ErrorCode.BAD_REQUEST, "Select one revision per diagram view");
            revisions.add(doc.revision());
        }
        if (versions.stream().anyMatch(java.util.Objects::isNull)) throw invalid();
        var diagramIds = new java.util.LinkedHashSet<>(versions);

        // At most 20 selections: load candidates once, then match the exact
        // (view, revision) pair. Separate IN sets must never substitute a revision.
        var documentsBySelection = new java.util.HashMap<SelectedDocument, ArchitectureDocument>();
        if (!docs.isEmpty()) {
            for (var doc : documents.findByModelVersionIdAndViewKeyInAndRevisionIn(modelId, viewKeys, revisions)) {
                documentsBySelection.put(new SelectedDocument(doc.getViewKey(), doc.getRevision()), doc);
            }
        }
        var diagramsById = new java.util.HashMap<UUID, DiagramVersion>();
        if (!diagramIds.isEmpty()) {
            for (var diagram : diagrams.findAllById(diagramIds)) diagramsById.put(diagram.getId(), diagram);
        }

        var layout = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode().put("frozenDocument", true);
        var artifacts = layout.putArray("artifacts");
        var pending = new java.util.ArrayList<DiagramVersion>();
        for (var selected : docs) {
            var document = documentsBySelection.get(selected);
            if (document == null) throw new BusinessException(ErrorCode.NOT_FOUND, "Saved diagram revision not found");
            var frozen = frozenDocument(model, document);
            pending.add(frozen);
            artifacts.addObject().put("notation", frozen.getNotation()).put("level", frozen.getLevel())
                    .set("layoutJson", frozen.getLayoutJson().deepCopy());
        }
        for (var id : diagramIds) {
            var diagram = diagramsById.get(id);
            if (diagram == null) throw new BusinessException(ErrorCode.NOT_FOUND);
            if (!diagram.getModelVersion().getId().equals(modelId)) throw new BusinessException(ErrorCode.BAD_REQUEST, "Diagram belongs to another model");
            artifacts.addObject().put("diagramVersionId", id.toString()).put("notation", diagram.getNotation())
                    .put("level", diagram.getLevel()).set("layoutJson", diagram.getLayoutJson().deepCopy());
        }
        // Validate every selection before persisting anything. Hibernate's
        // configured JDBC batch_size/order_inserts can batch these UUID inserts.
        pending.add(DiagramVersion.builder().modelVersion(model).notation("BUNDLE")
                .level("COURSEWORK_ARTIFACTS").layoutJson(layout).build());
        return diagrams.saveAll(pending).get(pending.size() - 1).getId();
    }
    @Transactional(readOnly=true)
    public java.util.List<Revision> revisions(UUID modelId) {
        var model = model(modelId); access.requireProjectReadAccess(model.getProject());
        return documents.findByModelVersionIdOrderByViewKeyAscRevisionDesc(modelId).stream()
            .map(d -> new Revision(modelId, d.getViewKey(), d.getRevision(), d.getUpdatedAt())).toList();
    }
    @Transactional
    public UUID freeze(UUID modelId, String viewKey, long revision) {
        validateKey(viewKey);
        var model = model(modelId); access.requireProjectWriteAccess(model.getProject());
        var document = documents.findByModelVersionIdAndViewKeyAndRevision(modelId, viewKey, revision)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Saved diagram revision not found"));
        return diagrams.save(frozenDocument(model, document)).getId();
    }

    private static DiagramVersion frozenDocument(ModelVersion model, ArchitectureDocument document) {
        String viewKey = document.getViewKey();
        String type = com.mavis.common.utils.CourseworkDiagramTypes.fromView(viewKey);
        if ("UNKNOWN".equals(type)) throw new BusinessException(ErrorCode.BAD_REQUEST, "Unknown diagram view type");
        String notation = type.startsWith("C4_") ? "C4" : type;
        String level = type.startsWith("C4_") ? type.substring(3) : "SAVED_DOCUMENT";
        var layout = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode()
            .put("diagramType", type).put("frozenDocument", true).put("documentId", document.getId().toString())
            .put("viewId", viewKey).put("documentRevision", document.getRevision()).put("drawioXml", document.getXml());
        return DiagramVersion.builder().modelVersion(model).notation(notation).level(level).layoutJson(layout).build();
    }
    @Transactional(readOnly=true)
    public Document get(UUID modelId,String viewKey,Long revision) {
        validateKey(viewKey);
        ModelVersion model=model(modelId);access.requireProjectReadAccess(model.getProject());
        var result=revision==null ? documents.findTopByModelVersionIdAndViewKeyOrderByRevisionDesc(modelId,viewKey) : documents.findByModelVersionIdAndViewKeyAndRevision(modelId,viewKey,revision);
        if(revision!=null&&result.isEmpty())throw new BusinessException(ErrorCode.NOT_FOUND,"Document revision not found");
        return result.map(d->view(d)).orElse(new Document(modelId,viewKey,0,null));
    }
    @Transactional
    public Document save(UUID modelId,String viewKey,Save request) {
        validateKey(viewKey);validateXml(request.xml());
        if(request.expectedRevision()<0)throw invalid();
        ModelVersion model=model(modelId);access.requireProjectWriteAccess(model.getProject());
        var workspace = model.getProject().getWorkspace();
        if (workspace != null && workspace.isCourseMode()
                && CourseLabPolicy.isStudent(access.requireCurrentActiveUser())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Guided Lab reference diagrams are read-only");
        }
        // Lock the parent to serialize both initial creation and later compare-and-set updates.
        entityManager.lock(model,LockModeType.PESSIMISTIC_WRITE);
        long currentRevision=documents.findTopByModelVersionIdAndViewKeyOrderByRevisionDesc(modelId,viewKey).map(ArchitectureDocument::getRevision).orElse(0L);
        if(currentRevision!=request.expectedRevision()) throw new BusinessException(ErrorCode.CONFLICT,"Document changed. Reload before saving.");
        ArchitectureDocument doc=new ArchitectureDocument();
        doc.setModelVersion(model);doc.setViewKey(viewKey);doc.setXml(request.xml());
        doc.setRevision(currentRevision+1);doc.setUpdatedAt(OffsetDateTime.now());
        return view(documents.saveAndFlush(doc));
    }
    private ModelVersion model(UUID id) {return models.findById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Model not found"));}
    private static Document view(ArchitectureDocument doc) {return new Document(doc.getModelVersion().getId(),doc.getViewKey(),doc.getRevision(),doc.getXml());}
    private static void validateKey(String key) {if(key==null||!key.matches("[a-zA-Z0-9:_-]{1,160}"))throw invalid();}
    public static void validateXml(String xml) {
        if(xml==null||xml.length()>2_000_000||xml.isBlank()||xml.toUpperCase(java.util.Locale.ROOT).contains("<!DOCTYPE"))throw invalid();
        try {
            var factory=DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
            factory.setXIncludeAware(false);factory.setExpandEntityReferences(false);
            var doc=factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
            String root=doc.getDocumentElement().getTagName();
            if(!root.equals("mxfile")&&!root.equals("mxGraphModel"))throw invalid();
            if(doc.getElementsByTagName("mxGraphModel").getLength()==0)throw invalid();
        } catch(BusinessException error) {throw error;} catch(Exception error) {throw invalid();}
    }
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Invalid architecture document");}
}
