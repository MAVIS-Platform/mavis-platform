package com.mavis.common.exception;

import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;
    private final String stableCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.stableCode = null;
    }

    public BusinessException(ErrorCode errorCode, String customMessage) {
        super(customMessage);
        this.errorCode = errorCode;
        this.stableCode = null;
    }

    public BusinessException(ErrorCode errorCode, String stableCode, String customMessage) {
        super(customMessage);
        this.errorCode = errorCode;
        this.stableCode = stableCode;
    }
}
