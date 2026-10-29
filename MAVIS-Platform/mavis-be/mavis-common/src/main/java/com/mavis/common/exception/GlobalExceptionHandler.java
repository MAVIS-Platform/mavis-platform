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
        } else if (code == 409) {
            status = HttpStatus.CONFLICT;
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
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResponse<Void> handleMissingResource(org.springframework.web.servlet.resource.NoResourceFoundException ex) {
        return ApiResponse.error(ErrorCode.NOT_FOUND);
    }

    @ExceptionHandler(org.springframework.web.HttpMediaTypeNotSupportedException.class)
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> handleContentType(org.springframework.web.HttpMediaTypeNotSupportedException ex) {
        return org.springframework.http.ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(ApiResponse.error(ErrorCode.BAD_REQUEST, "Unsupported request content type"));
    }

    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.web.multipart.support.MissingServletRequestPartException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleMalformedRequest(Exception ex) {
        return ApiResponse.error(ErrorCode.BAD_REQUEST);
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> handleUploadTooLarge(org.springframework.web.multipart.MaxUploadSizeExceededException ex) {
        return org.springframework.http.ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiResponse.error(ErrorCode.BAD_REQUEST, "Archive exceeds the 100 MB upload limit"));
    }

    @ExceptionHandler({
            org.springframework.dao.DataIntegrityViolationException.class,
            org.springframework.dao.OptimisticLockingFailureException.class,
            jakarta.persistence.OptimisticLockException.class
    })
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiResponse<Void> handleDataConflictException(Exception ex) {
        log.warn("Data Conflict / Optimistic Lock Exception: {}", ex.getMessage());
        return ApiResponse.error(ErrorCode.CONFLICT, "Dữ liệu đang được cập nhật hoặc có ràng buộc liên quan. Vui lòng tải lại và thử lại.");
    }

    @ExceptionHandler({
            IllegalArgumentException.class,
            jakarta.validation.ConstraintViolationException.class
    })
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleBadArgumentException(Exception ex) {
        log.warn("Bad Argument / Constraint Violation: {}", ex.getMessage());
        return ApiResponse.error(ErrorCode.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleGlobalException(Exception ex) {
        // Lỗi hệ thống nghiêm trọng, in log error thay vì log warn
        log.error("Unhandled Exception: ", ex);
        return ApiResponse.error(ErrorCode.INTERNAL_SERVER_ERROR);
    }
}
