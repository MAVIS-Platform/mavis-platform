package com.mavis.analyzer.workerclient.service;

import com.mavis.analyzer.workerclient.dto.DotnetAnalyzeResponseDTO;

import java.util.UUID;

public interface DotnetWorkerClientService {

    /**
     * Kiểm tra nhanh xem thư mục mã nguồn có chứa file .sln hoặc .csproj hay không
     * Bỏ qua các thư mục /test/, /bin/, /obj/, /.git/ để đảm bảo hiệu năng trong O(1) / < 1ms
     *
     * @param extractedPath Đường dẫn thư mục giải nén
     * @return true nếu tồn tại file dự án .NET / C#
     */
    boolean hasDotnetFiles(String extractedPath);

    /**
     * Gửi yêu cầu phân tích AST tới C# Roslyn Worker nếu có file .NET
     * Nếu không có file .NET -> trả về đối tượng rỗng ngay mà không gọi mạng
     * Nếu có lỗi kết nối hoặc Worker timeout -> bắt lỗi an toàn (Graceful Degradation) và trả về đối tượng rỗng kèm warning
     *
     * @param projectId ID của dự án
     * @param snapshotId ID của bản chụp nguồn
     * @param extractedPath Đường dẫn mã nguồn giải nén
     * @return Kết quả phân tích từ C# Roslyn Worker hoặc đối tượng rỗng an toàn
     */
    DotnetAnalyzeResponseDTO analyzeDotnetIfPresent(UUID projectId, UUID snapshotId, String extractedPath);
}
