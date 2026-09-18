package com.mavis.analyzer.orchestrator.service;

import com.mavis.analyzer.detector.docker.DockerDetector;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.ServiceNode;
import com.mavis.common.repository.AnalysisSessionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.utils.ZipUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalyzerOrchestrator {

    private final ProjectRepository projectRepository;
    private final AnalysisSessionRepository sessionRepository;
    private final DockerDetector dockerDetector;
    private final JavaSourceParser javaSourceParser;
    private final GraphBuilderService graphBuilderService;

    @Async
    @EventListener
    public void handleAnalyzeRequest(AnalyzeRequestEvent event) {
        log.info("Bắt đầu luồng phân tích cho Project ID: {}", event.projectId());

        Optional<Project> projectOpt;
        try {
            projectOpt = projectRepository.findById(event.projectId());
        } catch (Exception e) {
            log.error("Lỗi khi truy vấn thông tin dự án cho Project ID: {}", event.projectId(), e);
            return;
        }

        if (projectOpt.isEmpty()) {
            log.error("Không tìm thấy dự án với Project ID: {}", event.projectId());
            return;
        }

        Project project = projectOpt.get();

        AnalysisSession session;
        try {
            session = AnalysisSession.builder()
                    .project(project)
                    .triggeredBy(project.getOwner())
                    .status("RUNNING")
                    .isLatestValid(false)
                    .build();

            session = sessionRepository.save(session);
            log.info("Đã tạo AnalysisSession thành công cho Project ID: {}", event.projectId());
        } catch (Exception e) {
            log.error("Lỗi xảy ra trong quá trình khởi tạo AnalysisSession cho Project ID: {}", event.projectId(), e);
            return;
        }

        try {
            String extractedPath = ZipUtils.extract(event.zipFilePath());
            log.info("Đã giải nén mã nguồn tại đường dẫn: {}", extractedPath);

            List<String> detectedServices = dockerDetector.detectServices(extractedPath);
            log.info("Đã phát hiện {} Docker services: {}", detectedServices.size(), detectedServices);

            List<ServiceNode> savedNodes = graphBuilderService.buildAndSaveNodes(session, detectedServices);
            log.info("Đã lưu {} service nodes vào database", savedNodes.size());

            javaSourceParser.parseProject(extractedPath);
        } catch (Exception e) {
            log.error("Lỗi xảy ra trong quá trình trích xuất và phân tích Docker cho Project ID: {}", event.projectId(), e);
            session.setStatus("FAILED");
            session.setErrorMessage(e.getMessage());
            sessionRepository.save(session);
        }
    }
}
