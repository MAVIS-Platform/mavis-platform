package com.mavis.analyzer.config;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final int MAX_REQUESTS_PER_MINUTE = 5;
    private static final long WINDOW_IN_MS = 60000;

    private final ConcurrentHashMap<String, RequestData> requestCounts = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull Object handler
    ) {
        String clientIp = request.getRemoteAddr();
        long currentTime = System.currentTimeMillis();

        requestCounts.compute(clientIp, (key, requestData) -> {
            if (requestData == null || (currentTime - requestData.startTime) > WINDOW_IN_MS) {
                return new RequestData(currentTime, new AtomicInteger(1));
            }

            if (requestData.count.incrementAndGet() > MAX_REQUESTS_PER_MINUTE) {
                throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS, "Bạn thao tác quá nhanh, vui lòng thử lại sau");
            }

            return requestData;
        });

        return true;
    }

    private static class RequestData {
        long startTime;
        AtomicInteger count;

        RequestData(long startTime, AtomicInteger count) {
            this.startTime = startTime;
            this.count = count;
        }
    }
}
