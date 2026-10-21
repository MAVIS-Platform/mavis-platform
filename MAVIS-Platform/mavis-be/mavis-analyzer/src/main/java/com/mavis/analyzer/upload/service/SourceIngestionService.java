package com.mavis.analyzer.upload.service;

import com.mavis.analyzer.upload.dto.GitHubImportRequest;
import com.mavis.analyzer.upload.dto.IngestionResponseDTO;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

public interface SourceIngestionService {

    IngestionResponseDTO ingestZipUpload(UUID projectId, MultipartFile file);

    IngestionResponseDTO ingestFromGitHub(GitHubImportRequest request);
}
