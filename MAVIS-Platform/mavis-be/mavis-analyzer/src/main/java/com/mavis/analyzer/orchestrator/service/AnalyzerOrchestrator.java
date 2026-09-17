package com.mavis.analyzer.orchestrator.service;

import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.Project;
import com.mavis.common.repository.AnalysisSessionRepository;
import com.mavis.common.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalyzerOrchestrator {

    private final ProjectRepository projectRepository;
    private final AnalysisSessionRepository sessionRepository;

    @Async
    @EventListener
    public void handleAnalyzeRequest(AnalyzeRequestEvent event) {
        try {
            log.info("Bắt đầu luồng phân tích cho Project ID: {}", event.projectId());

            Optional<Project> projectOpt = projectRepository.findById(event.projectId());
            if (projectOpt.isEmpty()) {
                log.error("Không tìm thấy dự án với Project ID: {}", event.projectId());
                return;
            }

            Project project = projectOpt.get();

            AnalysisSession session = AnalysisSession.builder()
                    .project(project)
                    .triggeredBy(project.getOwner())
                    .status("RUNNING")
                    .isLatestValid(false)
                    .build();

            sessionRepository.save(session);
            log.info("Đã tạo AnalysisSession thành công cho Project ID: {}", event.projectId());
        } catch (Exception e) {
            log.error("Lỗi xảy ra trong quá trình khởi tạo luồng phân tích cho Project ID: {}", event.projectId(), e);
        }
    }
}
