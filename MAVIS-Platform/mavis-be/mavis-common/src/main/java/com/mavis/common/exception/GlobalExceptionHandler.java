package com.mavis.common.exception;

import com.mavis.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import org.springframework.security.access.AccessDeniedException;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Bắt lỗi nghiệp vụ tự định nghĩa (BusinessException)
     */
    @ExceptionHandler(BusinessException.class)
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
        log.warn("Business Exception: {}", ex.getMessage());
        int code = ex.getErrorCode().getCode();
        HttpStatus status;
        if (code == 401) {
            status = HttpStatus.UNAUTHORIZED;
        } else if (code == 403) {
            status = HttpStatus.FORBIDDEN;
        } else if (code == 404) {
            status = HttpStatus.NOT_FOUND;
        } else if (code == 429) {
            status = HttpStatus.TOO_MANY_REQUESTS;
        } else if (code >= 500) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        } else {
            status = HttpStatus.BAD_REQUEST;
        }
        return org.springframework.http.ResponseEntity.status(status).body(ApiResponse.error(ex.getErrorCode(), ex.getMessage()));
    }

    /**
     * Bắt lỗi Validate Form (Khi dùng @Valid ở DTO)
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleValidationException(MethodArgumentNotValidException ex) {
        // Gom tất cả các lỗi của các field lại thành 1 string duy nhất
        List<String> errors = ex.getBindingResult().getFieldErrors()
                .stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.toList());

        String errorMessage = String.join(", ", errors);
        log.warn("Validation Exception: {}", errorMessage);
        return ApiResponse.error(ErrorCode.BAD_REQUEST, errorMessage);
    }

    /**
     * Bắt lỗi 404 (Truy cập API không tồn tại)
     */
    @ExceptionHandler(NoHandlerFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResponse<Void> handleNotFoundException(NoHandlerFoundException ex) {
        log.warn("API Not Found: {}", ex.getRequestURL());
        return ApiResponse.error(ErrorCode.NOT_FOUND);
    }

    /**
     * Bắt lỗi sai method HTTP (Ví dụ API là POST nhưng lại gọi GET)
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    public ApiResponse<Void> handleMethodNotSupportedException(HttpRequestMethodNotSupportedException ex) {
        return ApiResponse.error(ErrorCode.METHOD_NOT_ALLOWED);
    }

    /**
     * Bắt lỗi liên quan đến phân quyền Spring Security (403 Forbidden)
     */
    @ExceptionHandler(AccessDeniedException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ApiResponse<Void> handleAccessDeniedException(AccessDeniedException ex) {
        return ApiResponse.error(ErrorCode.FORBIDDEN);
    }

    /**
     * Điểm chốt chặn cuối cùng (Bắt toàn bộ các lỗi Unchecked Exception còn lại như NullPointerException)
     */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleGlobalException(Exception ex) {
        // Lỗi hệ thống nghiêm trọng, in log error thay vì log warn
        log.error("Unhandled Exception: ", ex);
        return ApiResponse.error(ErrorCode.INTERNAL_SERVER_ERROR);
    }
}