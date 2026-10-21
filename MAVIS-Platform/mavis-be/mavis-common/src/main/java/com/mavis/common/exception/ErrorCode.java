package com.mavis.common.exception;

import lombok.Getter;

@Getter
public enum ErrorCode {
    // 200 - Thành công
    SUCCESS(200, "Thao tác thành công"),

    // 4xx - Lỗi phía Client (Frontend gửi sai)
    BAD_REQUEST(400, "Dữ liệu đầu vào không hợp lệ"),
    UNAUTHORIZED(401, "Chưa xác thực hoặc token hết hạn"),
    FORBIDDEN(403, "Không có quyền truy cập tài nguyên này"),
    NOT_FOUND(404, "Không tìm thấy dữ liệu yêu cầu"),
    CONFLICT(409, "Yêu cầu xung đột với dữ liệu đã lưu"),
    METHOD_NOT_ALLOWED(405, "Phương thức HTTP không được hỗ trợ"),
    TOO_MANY_REQUESTS(429, "Bạn thao tác quá nhanh, vui lòng thử lại sau"),
    PROJECT_LIMIT_EXCEEDED(4002, "Đã vượt quá giới hạn số lượng dự án của gói cước"),
    INSUFFICIENT_AI_CREDITS(4003, "Không đủ lượt dùng (Credit) để yêu cầu AI giải thích"),

    // 5xx - Lỗi phía Server (Backend)
    INTERNAL_SERVER_ERROR(500, "Đã xảy ra lỗi hệ thống, vui lòng thử lại sau"),
    FILE_UPLOAD_FAILED(5001, "Lỗi khi lưu trữ file ZIP"),
    ANALYSIS_FAILED(5002, "Quá trình phân tích mã nguồn thất bại");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
