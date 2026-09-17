package com.mavis.common.contract;

import java.util.UUID;

public record AnalyzeRequestEvent(
        UUID projectId,
        String zipFilePath
) {
}
