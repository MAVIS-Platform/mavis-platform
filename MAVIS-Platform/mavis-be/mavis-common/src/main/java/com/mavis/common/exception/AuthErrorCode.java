package com.mavis.common.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** Safe, stable authentication details; existing numeric API/HTTP codes are retained. */
@Getter
@RequiredArgsConstructor
public enum AuthErrorCode {
    LOGIN_CREDENTIALS(ErrorCode.UNAUTHORIZED, "Email or password is incorrect."),
    LOGIN_VERIFICATION(ErrorCode.FORBIDDEN, "Please verify your email before signing in."),
    LOGIN_LOCKED(ErrorCode.FORBIDDEN, "Your account is locked. Please contact the administrator for assistance."),
    AUTH_CODE_INVALID(ErrorCode.BAD_REQUEST, "The verification code is incorrect. Please try again."),
    AUTH_CODE_EXPIRED(ErrorCode.BAD_REQUEST, "The verification code has expired. Please request a new code."),
    AUTH_CODE_USED(ErrorCode.BAD_REQUEST, "This verification code has already been used. Please request a new code."),
    AUTH_RESET_INVALID(ErrorCode.BAD_REQUEST, "The password reset code is invalid. Please check it and try again."),
    AUTH_RESET_EXPIRED(ErrorCode.BAD_REQUEST, "The password reset code has expired. Please request a new code."),
    AUTH_RESET_USED(ErrorCode.BAD_REQUEST, "This password reset code has already been used. Please request a new code."),
    AUTH_PASSWORD_POLICY(ErrorCode.BAD_REQUEST, "Your password does not meet the requirements. Please review the password rules and try again."),
    AUTH_INPUT_INVALID(ErrorCode.BAD_REQUEST, "Please check the information entered and try again."),
    AUTH_VERIFICATION_UNAVAILABLE(ErrorCode.BAD_REQUEST, "Email verification could not be completed. Please check your code or sign in if already verified."),
    AUTH_EMAIL_DELIVERY(ErrorCode.INTERNAL_SERVER_ERROR, "We couldn't send the email right now. Please try again later."),
    AUTH_OAUTH_UNCONFIGURED(ErrorCode.INTERNAL_SERVER_ERROR, "Third-party sign-in is not configured for this workspace."),
    AUTH_OAUTH_FAILED(ErrorCode.UNAUTHORIZED, "Third-party sign-in failed. Please try again."),
    AUTH_OAUTH_EMAIL_UNVERIFIED(ErrorCode.FORBIDDEN, "Your third-party account must have a verified email address to sign in.");

    private final ErrorCode status;
    private final String message;
}
