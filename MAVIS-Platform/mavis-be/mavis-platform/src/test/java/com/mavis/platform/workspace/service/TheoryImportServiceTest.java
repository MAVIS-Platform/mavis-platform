package com.mavis.platform.workspace.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.security.AccessPolicyService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TheoryImportServiceTest {

    private final UUID workspaceId = UUID.randomUUID();
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final LlmTheoryDraftGenerator generator = mock(LlmTheoryDraftGenerator.class);
    private final TheoryImportService service = new TheoryImportService(access, generator);

    @Test
    void extractsSelectedPdfPagesAndFallsBackWhenAiUnavailable() throws Exception {
        byte[] pdfBytes = createPdf(
                "Page one introductory microservices overview with enough selectable characters.",
                "Page two bounded context and circuit breaker details for students to read.",
                "Page three distributed tracing and saga compensation summary."
        );
        MockMultipartFile file = new MockMultipartFile(
                "file", "architecture-book.pdf", "application/pdf", pdfBytes);
        when(generator.formatImportedContent(anyString(), anyString(), anyBoolean())).thenReturn(Optional.empty());

        var result = service.importFile(workspaceId, file, 2, 2, true, "en");

        assertEquals("PDF", result.sourceType());
        assertEquals(3, result.pageCount());
        assertEquals(1, result.extractedPages());
        assertFalse(result.aiFormatted());
        assertTrue(result.body().contains("bounded context and circuit breaker"));
        assertFalse(result.body().contains("Page one introductory"));
        assertFalse(result.body().contains("Page three distributed tracing"));
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("AI structuring unavailable")));
    }

    @Test
    void extractsDocxHeadingsBulletsAndTables() throws Exception {
        String documentXml = """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                  <w:body>
                    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Service Boundaries</w:t></w:r></w:p>
                    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Own database schema</w:t></w:r></w:p>
                    <w:tbl>
                      <w:tr><w:tc><w:p><w:r><w:t>Service</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Port</w:t></w:r></w:p></w:tc></w:tr>
                      <w:tr><w:tc><w:p><w:r><w:t>Orders</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>8080</w:t></w:r></w:p></w:tc></w:tr>
                    </w:tbl>
                  </w:body>
                </w:document>
                """;
        MockMultipartFile file = new MockMultipartFile(
                "file", "chapter1.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                zipOf(Map.of("word/document.xml", documentXml)));

        var result = service.importFile(workspaceId, file, null, null, false, "vi");

        assertEquals("DOCX", result.sourceType());
        assertTrue(result.body().contains("# Service Boundaries"));
        assertTrue(result.body().contains("- Own database schema"));
        assertTrue(result.body().contains("| Service | Port |"));
        assertTrue(result.body().contains("| Orders | 8080 |"));
    }

    @Test
    void extractsPptxSlidesInOrder() throws Exception {
        String slide1 = """
                <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                  <p:cSld><p:spTree>
                    <p:sp><p:txBody><a:p><a:r><a:t>Resilience4j Patterns</a:t></a:r></a:p><a:p><a:r><a:t>Circuit Breaker prevents cascading failures</a:t></a:r></a:p></p:txBody></p:sp>
                  </p:spTree></p:cSld>
                </p:sld>
                """;
        String slide2 = """
                <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                  <p:cSld><p:spTree>
                    <p:sp><p:txBody><a:p><a:r><a:t>Retry &amp; TimeLimiter</a:t></a:r></a:p><a:p><a:r><a:t>Configure exponential backoff</a:t></a:r></a:p></p:txBody></p:sp>
                  </p:spTree></p:cSld>
                </p:sld>
                """;
        MockMultipartFile file = new MockMultipartFile(
                "file", "lecture.pptx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                zipOf(Map.of("ppt/slides/slide2.xml", slide2, "ppt/slides/slide1.xml", slide1)));

        var result = service.importFile(workspaceId, file, null, null, false, "en");

        assertEquals("PPTX", result.sourceType());
        assertEquals(2, result.pageCount());
        int slide1Idx = result.body().indexOf("## Slide 1: Resilience4j Patterns");
        int slide2Idx = result.body().indexOf("## Slide 2: Retry & TimeLimiter");
        assertTrue(slide1Idx >= 0 && slide2Idx > slide1Idx);
        assertTrue(result.body().contains("- Circuit Breaker prevents cascading failures"));
    }

    @Test
    void convertsHtmlMainContentToCleanMarkdownWithoutNavOrScripts() {
        String html = """
                <html><body>
                  <nav><a href="/home">Home</a><script>alert(1)</script></nav>
                  <article>
                    <h1>Microservice Gateway Roadmap</h1>
                    <p>Read <a href="/guides/auth">Auth Guide</a> carefully.</p>
                    <pre><code class="language-java">var route = "gateway";</code></pre>
                    <ul><li>Rate limiting</li><li>JWT validation</li></ul>
                    <table><tr><th>Pattern</th><th>Use</th></tr><tr><td>Gateway</td><td>Routing</td></tr></table>
                  </article>
                </body></html>
                """;
        var doc = Jsoup.parse(html, "https://example.org/roadmap");

        String md = TheoryImportService.htmlToMarkdown(doc);

        assertFalse(md.contains("alert(1)"));
        assertFalse(md.contains("Home"));
        assertTrue(md.contains("# Microservice Gateway Roadmap"));
        assertTrue(md.contains("[Auth Guide](https://example.org/guides/auth)"));
        assertTrue(md.contains("```java\nvar route = \"gateway\";\n```"));
        assertTrue(md.contains("- Rate limiting"));
        assertTrue(md.contains("| Pattern | Use |"));
    }

    @Test
    void blocksSsrfTargetsForUrlImport() {
        for (String blocked : new String[]{
                "http://127.0.0.1/admin",
                "http://localhost:8080/health",
                "http://169.254.169.254/latest/meta-data/",
                "file:///etc/passwd"
        }) {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> TheoryImportService.validatePublicUrl(blocked), blocked);
            assertEquals(ErrorCode.BAD_REQUEST, ex.getErrorCode());
        }
    }

    private static byte[] createPdf(String... pageTexts) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (String text : pageTexts) {
                PDPage page = new PDPage();
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(font, 12);
                    cs.newLineAtOffset(50, 700);
                    cs.showText(text);
                    cs.endText();
                }
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] zipOf(Map<String, String> entries) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(out)) {
            for (var entry : entries.entrySet()) {
                zos.putNextEntry(new ZipEntry(entry.getKey()));
                zos.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
        return out.toByteArray();
    }
}
