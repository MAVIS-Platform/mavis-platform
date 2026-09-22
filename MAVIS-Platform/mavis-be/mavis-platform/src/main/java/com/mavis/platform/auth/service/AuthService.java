package com.mavis.platform.auth.service;

import com.mavis.platform.auth.dto.AuthResponse;
import com.mavis.platform.auth.dto.LoginRequest;
import com.mavis.platform.auth.dto.RegisterRequest;

import com.mavis.platform.auth.dto.RegisterResponse;

public interface AuthService {
    RegisterResponse register(RegisterRequest request);
    AuthResponse login(LoginRequest request);
}
