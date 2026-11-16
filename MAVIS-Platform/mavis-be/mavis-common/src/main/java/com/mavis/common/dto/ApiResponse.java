package com.mavis.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.mavis.common.exception.ErrorCode;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL) // Sẽ ẩn đi field 'data' nếu nó bị null (ví dụ khi có lỗi)
public class ApiResponse<T> {
    private int code;
    private String message;
    private String errorCode;
    private T data;

    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    // Dành cho API trả về thành công có dữ liệu
    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .code(ErrorCode.SUCCESS.getCode())
                .message(ErrorCode.SUCCESS.getMessage())
                .data(data)
                .build();
    }

    // Dành cho API trả về thành công nhưng có custom thông báo
    public static <T> ApiResponse<T> success(String message, T data) {
        return ApiResponse.<T>builder()
                .code(ErrorCode.SUCCESS.getCode())
                .message(message)
                .data(data)
                .build();
    }

    // Dành cho lỗi (Dùng ErrorCode chuẩn)
    public static <T> ApiResponse<T> error(ErrorCode errorCode) {
        return ApiResponse.<T>builder()
                .code(errorCode.getCode())
                .message(errorCode.getMessage())
                .build();
    }

    // Dành cho lỗi (Dùng Custom message - thường dùng trong Validate Form)
    public static <T> ApiResponse<T> error(ErrorCode errorCode, String customMessage) {
        return ApiResponse.<T>builder()
                .code(errorCode.getCode())
                .message(customMessage)
                .build();
    }
}
