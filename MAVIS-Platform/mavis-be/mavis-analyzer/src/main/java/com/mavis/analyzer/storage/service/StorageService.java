package com.mavis.analyzer.storage.service;

import org.springframework.web.multipart.MultipartFile;

public interface StorageService {
    String store(MultipartFile file);
    String store(byte[] data, String originalFilename);
    String store(java.io.InputStream inputStream, String originalFilename);
}
