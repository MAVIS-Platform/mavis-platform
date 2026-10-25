package com.mavis.analyzer.diagram.service.impl;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
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
    public record Document(UUID modelId,String viewId,long revision,String xml) {}
    public record Save(long expectedRevision,String xml) {}
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