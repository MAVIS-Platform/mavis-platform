package com.mavis.analyzer.ai.service.impl;

import com.mavis.analyzer.ai.service.AiExplanationService;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ServiceNode;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ServiceNodeRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiExplanationServiceImpl implements AiExplanationService {

    private final ChatClient.Builder chatClientBuilder;
    private final ServiceNodeRepository serviceNodeRepository;
    private final EvidenceRepository evidenceRepository;
    
    private ChatClient chatClient;

    @PostConstruct
    public void init() {
        this.chatClient = chatClientBuilder.build();
    }

    @Override
    public String generateExplanationText(UUID sessionId, UUID nodeId) {
        log.info("Generating AI explanation for session: {}, node: {}", sessionId, nodeId);
        
        ServiceNode node = serviceNodeRepository.findById(nodeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Service Node"));
                
        List<Evidence> evidences = evidenceRepository.findByNodeId(nodeId);
        
        StringBuilder promptBuilder = new StringBuilder();
        promptBuilder.append("Bạn là một Chuyên gia Kiến trúc Phần mềm. Hãy giải thích vai trò của Microservice có tên là [")
                     .append(node.getName())
                     .append("] dựa trên bằng chứng mã nguồn sau. Trả lời bằng tiếng Việt, ngắn gọn.\n\n");
                     
        if (evidences != null && !evidences.isEmpty()) {
            for (Evidence evidence : evidences) {
                promptBuilder.append("- File: ").append(evidence.getFilePath()).append("\n");
                promptBuilder.append("  Line: ").append(evidence.getLineNumber()).append("\n");
                promptBuilder.append("  Code:\n").append(evidence.getCodeSnippet()).append("\n\n");
            }
        } else {
            promptBuilder.append("Không có bằng chứng mã nguồn cụ thể nào cho Node này.");
        }
        
        String assembledPrompt = promptBuilder.toString();
        
        try {
            return chatClient.prompt().user(assembledPrompt).call().content();
        } catch (Exception e) {
            log.error("Lỗi khi gọi AI API", e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể kết nối đến AI Provider");
        }
    }
}
