package com.mavis.platform.assignment.service;

import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.utils.HashUtils;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class LabReferenceArchiveTest {
    @TempDir Path directory;

    @Test
    void checksPublishedDigestAndKeepsLegacyArchiveReadable() throws Exception {
        var archive = Files.writeString(directory.resolve("reference.zip"), "sample source archive");
        var storage = new LabReferenceArchive(directory.toString());
        var source = SourceSnapshot.builder().storagePath(archive.toString())
                .artifactHash(HashUtils.sha256Hex(archive)).build();

        assertTrue(storage.resolve(source, true).exists());
        Files.writeString(archive, "changed after publication");
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                () -> storage.resolve(source, true)).getErrorCode());
        assertTrue(storage.resolve(source, false).exists());
    }

    @Test
    void rejectsMissingFilesAndPathsOutsideStorage() throws Exception {
        var root = Files.createDirectory(directory.resolve("store"));
        var storage = new LabReferenceArchive(root.toString());
        var outside = Files.writeString(directory.resolve("other.zip"), "outside");
        for (Path path : new Path[]{outside, root.resolve("absent.zip"), root}) {
            var source = SourceSnapshot.builder().storagePath(path.toString()).build();
            assertEquals(ErrorCode.NOT_FOUND, assertThrows(BusinessException.class,
                    () -> storage.resolve(source, true)).getErrorCode());
        }
    }

    @Test
    void materializesCuratedArchiveInTempFallbackWhenMissingFromPrimaryStorage() throws Exception {
        var missingPrimary = Files.createDirectory(directory.resolve("empty-primary"))
                .resolve("curated-course-test-demo.zip");
        byte[] bytes = com.mavis.platform.workspace.service.CourseLabSeederService.buildCuratedArchive();
        Path expectedTempCopy = Path.of(System.getProperty("java.io.tmpdir"), "mavis-uploads")
                .resolve("curated-course-test-demo.zip");
        try {
            var storage = new LabReferenceArchive(directory.toString());
            var source = SourceSnapshot.builder()
                    .storagePath(missingPrimary.toString())
                    .artifactHash(HashUtils.sha256Hex(bytes))
                    .build();

            var resolved = storage.resolve(source, true);
            assertTrue(resolved.exists());
            assertTrue(Files.isRegularFile(expectedTempCopy));
        } finally {
            Files.deleteIfExists(expectedTempCopy);
        }
    }
}
