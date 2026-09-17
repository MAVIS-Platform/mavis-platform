package com.mavis.common.utils;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class ZipUtils {

    public static String extract(String zipFilePath) throws IOException {
        File zipFile = new File(zipFilePath);
        if (!zipFile.exists() || !zipFile.isFile()) {
            throw new IOException("File ZIP không tồn tại: " + zipFilePath);
        }

        File parentDir = zipFile.getParentFile();
        String fileName = zipFile.getName();
        String folderName;
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0 && fileName.substring(dotIndex).equalsIgnoreCase(".zip")) {
            folderName = fileName.substring(0, dotIndex) + "_extracted";
        } else {
            folderName = fileName + "_extracted";
        }

        File targetDir = parentDir != null ? new File(parentDir, folderName) : new File(folderName);
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            throw new IOException("Không thể tạo thư mục đích: " + targetDir.getAbsolutePath());
        }

        String targetCanonicalPath = targetDir.getCanonicalPath();

        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File entryFile = new File(targetDir, entry.getName());
                String entryCanonicalPath = entryFile.getCanonicalPath();

                // Zip Slip vulnerability protection
                if (!entryCanonicalPath.startsWith(targetCanonicalPath + File.separator)
                        && !entryCanonicalPath.equals(targetCanonicalPath)) {
                    throw new IOException("Phát hiện lỗ hổng Zip Slip! File nằm ngoài thư mục đích: " + entry.getName());
                }

                if (entry.isDirectory()) {
                    if (!entryFile.isDirectory() && !entryFile.mkdirs()) {
                        throw new IOException("Không thể tạo thư mục: " + entryFile.getAbsolutePath());
                    }
                } else {
                    File parent = entryFile.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        throw new IOException("Không thể tạo thư mục cha: " + parent.getAbsolutePath());
                    }
                    try (FileOutputStream fos = new FileOutputStream(entryFile)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = zis.read(buffer)) != -1) {
                            fos.write(buffer, 0, bytesRead);
                        }
                    }
                }
                zis.closeEntry();
            }
        }

        return targetDir.getAbsolutePath();
    }
}
