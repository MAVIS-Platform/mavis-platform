package com.mavis.analyzer.storage.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.*;
import java.nio.file.*;
import java.util.UUID;

@Service
public class LocalDiskStorageServiceImpl implements StorageService {
    private static final long MAX_BYTES = 100L * 1024 * 1024;
    @Value("${mavis.storage.upload-dir:C:/mavis/uploads/}")
    private String uploadDir;

    @Override public String store(MultipartFile file) {
        if (file == null || file.getSize() > MAX_BYTES) throw rejected();
        try (InputStream input = file.getInputStream()) { return store(input, file.getOriginalFilename()); }
        catch (IOException e) { throw rejected(); }
    }

    @Override public String store(byte[] data, String originalFilename) {
        if (data == null || data.length > MAX_BYTES) throw rejected();
        return store(new ByteArrayInputStream(data), originalFilename);
    }

    @Override public String store(InputStream input, String originalFilename) {
        Path temporary = null;
        try {
            if (input == null) throw new IOException("Missing artifact stream");
            Path root = Paths.get(uploadDir).toAbsolutePath().normalize();
            rejectLinks(root);
            Files.createDirectories(root);
            rejectLinks(root);
            // Client filenames never participate in a filesystem path.
            Path target = root.resolve(UUID.randomUUID() + "_source.zip");
            temporary = Files.createTempFile(root, ".mavis-upload-", ".part");
            try (OutputStream output = Files.newOutputStream(temporary)) {
                byte[] buffer = new byte[8192]; long total = 0; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Artifact upload cancelled");
                    total += count;
                    if (total > MAX_BYTES) throw new IOException("Artifact byte budget exceeded");
                    output.write(buffer, 0, count);
                }
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            return target.toString();
        } catch (IOException e) { throw rejected(); }
        finally {
            if (temporary != null) try { Files.deleteIfExists(temporary); } catch (IOException ignored) { }
        }
    }

    private static void rejectLinks(Path path) throws IOException {
        for (Path current = path; current != null; current = current.getParent())
            if (Files.isSymbolicLink(current)) throw new IOException("Artifact root contains a symbolic link");
    }
    private static BusinessException rejected() {
        return new BusinessException(ErrorCode.FILE_UPLOAD_FAILED, "Artifact storage rejected or exceeded its 100 MiB budget");
    }
}
