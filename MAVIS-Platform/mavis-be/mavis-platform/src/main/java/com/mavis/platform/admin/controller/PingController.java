package com.mavis.platform.admin.controller;

import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/system")
@Tag(name = "System Check", description = "API kiểm tra trạng thái của hệ thống MAVIS")
public class PingController {

    @GetMapping("/ping")
    @Operation(summary = "Kiểm tra kết nối", description = "Trả về thông điệp báo hiệu Backend đang hoạt động bình thường")
    public ApiResponse<String> ping() {
        return ApiResponse.success("Pong! MAVIS System is up and running.");
    }
}