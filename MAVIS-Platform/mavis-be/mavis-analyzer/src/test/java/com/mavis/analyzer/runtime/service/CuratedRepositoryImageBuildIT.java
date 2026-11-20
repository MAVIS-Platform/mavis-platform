package com.mavis.analyzer.runtime.service;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import static org.assertj.core.api.Assertions.assertThat;

class CuratedRepositoryImageBuildIT {
    @Test
    @Timeout(value = 25, unit = TimeUnit.MINUTES)
    void buildsPinnedCuratedRepositoryUsingTheApplicationBuilder() {
        String root = System.getenv("MAVIS_CURATED_SOURCE_ROOT");
        assertThat(root).as("The dedicated curated-image QA workflow must provide the source directory").isNotBlank();
        int expected = Integer.parseInt(System.getenv("MAVIS_CURATED_SERVICE_COUNT"));
        var builder = new SandboxImageBuilderService();
        var result = builder.buildSnapshotImages(UUID.randomUUID(), UUID.randomUUID(), Path.of(root), List.of());
        assertThat(result.errors()).as("Build errors from the pinned curated source").isEmpty();
        assertThat(result.builtImages()).hasSize(expected);
        assertThat(result.builtImages().values()).allMatch(image -> image.matches("sha256:[0-9a-fA-F]{64}"));
    }
}
