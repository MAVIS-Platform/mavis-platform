package com.mavis.analyzer.ai.service.impl;

import com.mavis.common.entity.AiExplanation;
import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.ServiceNode;
import com.mavis.common.entity.User;
import com.mavis.common.entity.UserSubscription;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.AiExplanationRepository;
import com.mavis.common.repository.AnalysisSessionRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ServiceNodeRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.UserSubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.ChatOptions;

import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class AiExplanationServiceImplTest {

    @Mock
    private ServiceNodeRepository serviceNodeRepository;
    @Mock
    private EvidenceRepository evidenceRepository;
    @Mock
    private UserSubscriptionRepository userSubscriptionRepository;
    @Mock
    private AiExplanationRepository aiExplanationRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private AnalysisSessionRepository analysisSessionRepository;
    @Mock
    private ChatClient chatClient;

    // Chú ý: Vì ChatClient.Builder là factory, ta phải mock phức tạp hơn một chút, 
    // Nhưng vì Test này mục đích là Unit Test, ta có thể inject trực tiếp ChatClient 
    // bằng reflection hoặc thông qua setter. Trong code, chatClient được init qua PostConstruct.
    // Để đơn giản, ta sẽ mock behavior của ChatClient.
    
    @InjectMocks
    private AiExplanationServiceImpl aiExplanationService;

    private UUID userId;
    private UUID sessionId;
    private UUID nodeId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        sessionId = UUID.randomUUID();
        nodeId = UUID.randomUUID();
        
        // Dùng reflection để set chatClient vì nó được init trong @PostConstruct
        org.springframework.test.util.ReflectionTestUtils.setField(aiExplanationService, "chatClient", chatClient);
    }

    @Test
    @DisplayName("Thành công: Gọi AI, Lưu DB và Trừ 1 Credit")
    void explainNode_Success() {
        // Chuẩn bị Mock Data (Giả lập Database)
        UserSubscription subscription = new UserSubscription();
        subscription.setAiCreditsRemaining(5);
        
        when(userSubscriptionRepository.findByUserIdAndStatus(userId, "ACTIVE"))
                .thenReturn(Optional.of(subscription));
                
        when(userRepository.findById(userId)).thenReturn(Optional.of(new User()));
        when(analysisSessionRepository.findById(sessionId)).thenReturn(Optional.of(new AnalysisSession()));
        
        ServiceNode node = new ServiceNode();
        node.setName("AuthService");
        when(serviceNodeRepository.findById(nodeId)).thenReturn(Optional.of(node));
        
        when(evidenceRepository.findByNodeId(nodeId)).thenReturn(Collections.emptyList());

        // Giả lập OpenAI API Call bằng Deep Stubs (Tránh lỗi class không tồn tại trong Mockito do Version M1)
        ChatClient deepChatClient = mock(ChatClient.class, RETURNS_DEEP_STUBS);
        org.springframework.test.util.ReflectionTestUtils.setField(aiExplanationService, "chatClient", deepChatClient);
        when(deepChatClient.prompt().user(anyString()).call().content()).thenReturn("Microservice AuthService có vai trò xác thực...");

        // Thực thi hành động
        AiExplanation result = aiExplanationService.explainNode(sessionId, nodeId, userId);

        // Kì vọng
        assertNotNull(result);
        assertEquals("Microservice AuthService có vai trò xác thực...", result.getExplanationText());
        assertEquals(1, result.getCreditCost());
        
        // Kì vọng trừ điểm: 5 -> 4
        assertEquals(4, subscription.getAiCreditsRemaining());
        
        // Đảm bảo hàm save được gọi chính xác 1 lần
        verify(aiExplanationRepository, times(1)).save(any(AiExplanation.class));
        verify(userSubscriptionRepository, times(1)).save(subscription);
    }

    @Test
    @DisplayName("Thất bại: Hết Credit AI")
    void explainNode_Fail_OutOfCredits() {
        UserSubscription subscription = new UserSubscription();
        subscription.setAiCreditsRemaining(0); // 0 lượt
        
        when(userSubscriptionRepository.findByUserIdAndStatus(userId, "ACTIVE"))
                .thenReturn(Optional.of(subscription));

        BusinessException exception = assertThrows(BusinessException.class, () -> {
            aiExplanationService.explainNode(sessionId, nodeId, userId);
        });

        assertEquals("Tài khoản đã hết lượt AI", exception.getMessage());
        
        // Đảm bảo KHÔNG gọi sang OpenAI và KHÔNG trừ điểm
        verify(chatClient, never()).prompt();
        verify(userSubscriptionRepository, never()).save(any());
    }

    @Test
    @DisplayName("Thất bại: OpenAI văng lỗi (Lỗi 401 hoặc 500) -> Rollback Credit")
    void explainNode_Fail_OpenAI_Error() {
        UserSubscription subscription = new UserSubscription();
        subscription.setAiCreditsRemaining(5);
        
        when(userSubscriptionRepository.findByUserIdAndStatus(userId, "ACTIVE"))
                .thenReturn(Optional.of(subscription));
        when(userRepository.findById(userId)).thenReturn(Optional.of(new User()));
        when(analysisSessionRepository.findById(sessionId)).thenReturn(Optional.of(new AnalysisSession()));
        
        ServiceNode node = new ServiceNode();
        node.setName("AuthService");
        when(serviceNodeRepository.findById(nodeId)).thenReturn(Optional.of(node));
        
        // Giả lập OpenAI văng Exception (Ví dụ Unauthorized 401)
        ChatClient deepChatClient = mock(ChatClient.class, RETURNS_DEEP_STUBS);
        org.springframework.test.util.ReflectionTestUtils.setField(aiExplanationService, "chatClient", deepChatClient);
        when(deepChatClient.prompt().user(anyString()).call().content()).thenThrow(new RuntimeException("401 Unauthorized"));

        BusinessException exception = assertThrows(BusinessException.class, () -> {
            aiExplanationService.explainNode(sessionId, nodeId, userId);
        });

        assertEquals("Không thể kết nối đến AI Provider", exception.getMessage());
        
        // Quan trọng nhất của @Transactional: Vì ném Exception nên DB không bao giờ gọi hàm save!
        // Credit vẫn giữ nguyên là 5
        assertEquals(5, subscription.getAiCreditsRemaining());
        verify(aiExplanationRepository, never()).save(any());
        verify(userSubscriptionRepository, never()).save(any());
    }
}
