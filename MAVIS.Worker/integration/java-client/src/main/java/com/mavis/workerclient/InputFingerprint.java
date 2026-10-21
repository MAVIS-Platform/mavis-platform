package com.mavis.workerclient;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.*;

/** Same supported input set/decoded-text hash as .NET; unsupported encodings fail instead of guessing. */
public final class InputFingerprint {
    public record Manifest(String digest, boolean hasDotnet, List<String> files) {}
    private static final Set<String> IGNORED = Set.of("bin", "obj", ".git", ".vs", "node_modules");
    private InputFingerprint() {}

    public static Manifest inspect(Path root) throws IOException {
        validateDirectory(root);
        var files = new TreeMap<String,Path>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            private int entries;
            private void count() throws IOException { if (++entries > 50_000) throw new IOException("Snapshot entry budget exceeded"); }
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                count(); if (attrs.isSymbolicLink()) throw new IOException("Linked snapshot path rejected");
                return !dir.equals(root) && IGNORED.contains(dir.getFileName().toString().toLowerCase(Locale.ROOT)) ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                count(); if (attrs.isSymbolicLink() || !attrs.isRegularFile()) throw new IOException("Non-regular snapshot entry rejected");
                String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
                if (name.endsWith(".cs") || name.endsWith(".csproj") || name.endsWith(".sln") || name.startsWith("appsettings") && name.endsWith(".json")) {
                    String relative = root.relativize(file).toString().replace('\\', '/');
                    if (file.getFileName().toString().contains("\\") || relative.contains(":")) throw new IOException("Non-portable snapshot path rejected");
                    files.put(relative, file); if (files.size() > 2000) throw new IOException("Snapshot file budget exceeded");
                }
                return FileVisitResult.CONTINUE;
            }
        });
        var digest = sha256(); long total = 0;
        for (var entry : files.entrySet()) {
            if (Thread.currentThread().isInterrupted()) throw new IOException("Snapshot preparation interrupted");
            long size = Files.size(entry.getValue());
            if (size > 1_048_576 || (total += size) > 20_971_520) throw new IOException("Snapshot byte budget exceeded");
            byte[] bytes;
            try (var stream = Files.newInputStream(entry.getValue(), LinkOption.NOFOLLOW_LINKS)) { bytes = stream.readNBytes(1_048_577); }
            if (bytes.length != size) throw new IOException("Snapshot changed during preparation");
            digest.update(entry.getKey().getBytes(StandardCharsets.UTF_8)); digest.update((byte) 0);
            digest.update(sha256().digest(decode(bytes).getBytes(StandardCharsets.UTF_8)));
        }
        return new Manifest(HexFormat.of().formatHex(digest.digest()), files.keySet().stream().anyMatch(n -> n.toLowerCase(Locale.ROOT).endsWith(".csproj") || n.toLowerCase(Locale.ROOT).endsWith(".sln")), List.copyOf(files.keySet()));
    }
    static void validateDirectory(Path path) throws IOException {
        if (!path.isAbsolute() || !Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Snapshot directory required");
        for (Path p = path.toAbsolutePath().normalize(); p != null; p = p.getParent())
            if (Files.isSymbolicLink(p)) throw new IOException("Linked snapshot directory rejected");
    }
    static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); } catch (Exception e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    private static String decode(byte[] bytes) throws IOException {
        Charset charset = StandardCharsets.UTF_8; int offset = 0;
        if (prefix(bytes, 0xff,0xfe,0,0)) { charset = Charset.forName("UTF-32LE"); offset = 4; }
        else if (prefix(bytes,0,0,0xfe,0xff)) { charset = Charset.forName("UTF-32BE"); offset = 4; }
        else if (prefix(bytes,0xef,0xbb,0xbf)) offset = 3;
        else if (prefix(bytes,0xff,0xfe)) { charset = StandardCharsets.UTF_16LE; offset = 2; }
        else if (prefix(bytes,0xfe,0xff)) { charset = StandardCharsets.UTF_16BE; offset = 2; }
        return charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes, offset, bytes.length - offset)).toString();
    }
    private static boolean prefix(byte[] bytes, int... values) {
        if (bytes.length < values.length) return false;
        for (int i=0;i<values.length;i++) if ((bytes[i] & 255) != values[i]) return false;
        return true;
    }
}
