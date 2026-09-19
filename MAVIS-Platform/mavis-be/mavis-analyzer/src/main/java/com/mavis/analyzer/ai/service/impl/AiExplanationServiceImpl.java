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

import com.mavis.common.entity.AiExplanation;
import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.User;
import com.mavis.common.entity.UserSubscription;
import com.mavis.common.repository.AiExplanationRepository;
import com.mavis.common.repository.AnalysisSessionRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.UserSubscriptionRepository;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiExplanationServiceImpl implements AiExplanationService {

    private final ChatClient.Builder chatClientBuilder;
    private final ServiceNodeRepository serviceNodeRepository;
    private final EvidenceRepository evidenceRepository;
    private final UserSubscriptionRepository userSubscriptionRepository;
    private final AiExplanationRepository aiExplanationRepository;
    private final UserRepository userRepository;
    private final AnalysisSessionRepository analysisSessionRepository;
    
    private ChatClient chatClient;

    @PostConstruct
    public void init() {
        this.chatClient = chatClientBuilder.build();
    }

    private String buildPrompt(ServiceNode node, List<Evidence> evidences) {
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
        return promptBuilder.toString();
    }

    @Override
    public String generateExplanationText(UUID sessionId, UUID nodeId) {
        log.info("Generating AI explanation for session: {}, node: {}", sessionId, nodeId);
        
        ServiceNode node = serviceNodeRepository.findById(nodeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Service Node"));
                
        List<Evidence> evidences = evidenceRepository.findByNodeId(nodeId);
        
        String assembledPrompt = buildPrompt(node, evidences);
        
        try {
            return chatClient.prompt().user(assembledPrompt).call().content();
        } catch (Exception e) {
            log.error("Lỗi khi gọi AI API", e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể kết nối đến AI Provider");
        }
    }

    @Override
    @Transactional
    public AiExplanation explainNode(UUID sessionId, UUID nodeId, UUID requestedByUserId) {
        log.info("Process explainNode for user: {}, session: {}, node: {}", requestedByUserId, sessionId, nodeId);
        
        // 1. Kiểm tra Subscription
        UserSubscription subscription = userSubscriptionRepository.findByUserIdAndStatus(requestedByUserId, "ACTIVE")
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy gói cước của người dùng"));
                
        if (subscription.getAiCreditsRemaining() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Tài khoản đã hết lượt AI");
        }

        // 2. Load các Entities liên quan
        User user = userRepository.findById(requestedByUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng"));
        AnalysisSession session = analysisSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Session"));
        ServiceNode node = serviceNodeRepository.findById(nodeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy Service Node"));

        // 3. Build Prompt và Gọi AI
        List<Evidence> evidences = evidenceRepository.findByNodeId(nodeId);
        String prompt = buildPrompt(node, evidences);
        String explanationText;
        try {
            explanationText = chatClient.prompt().user(prompt).call().content();
        } catch (Exception e) {
            log.error("Lỗi khi gọi AI API trong explainNode", e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể kết nối đến AI Provider");
        }

        // 4. Lưu lại lịch sử
        AiExplanation explanation = AiExplanation.builder()
                .session(session)
                .node(node)
                .requestedBy(user)
                .explanationText(explanationText)
                .promptUsed(prompt)
                .creditCost(1)
                .build();
        aiExplanationRepository.save(explanation);

        // 5. Trừ tiền / Credit
        subscription.setAiCreditsRemaining(subscription.getAiCreditsRemaining() - 1);
        userSubscriptionRepository.save(subscription);

        return explanation;
    }
}
