package com.mavis.common.exception;

import lombok.Getter;

@Getter
public class AuthException extends BusinessException {
    private final AuthErrorCode authErrorCode;

    public AuthException(AuthErrorCode code) {
        super(code.getStatus(), code.getMessage());
        this.authErrorCode = code;
    }
}
