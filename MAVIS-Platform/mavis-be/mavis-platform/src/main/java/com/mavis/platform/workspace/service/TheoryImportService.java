package com.mavis.platform.workspace.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Extracts and structures lecturer-supplied materials (PDF, DOCX, PPTX, MD/TXT, public web/roadmap URLs)
 * into clean Markdown ready for Lab Theory authoring.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TheoryImportService {

    private static final long MAX_FILE_BYTES = 20L * 1024 * 1024;
    private static final int MAX_XML_BYTES = 10 * 1024 * 1024;
    private static final int MAX_URL_BYTES = 4 * 1024 * 1024;
    private static final int MAX_PDF_PAGES_PER_IMPORT = 50;
    private static final int MAX_REDIRECTS = 3;
    private static final int MAX_BODY_CHARS = 48_000;

    private static final Pattern SLIDE_NAME_PATTERN = Pattern.compile("^ppt/slides/slide(\\d+)\\.xml$");
    private static final Pattern CHAPTER_HEADING_PATTERN =
            Pattern.compile("^(chapter|chương|phần|section|bài)\\s+\\d+([.:]\\s*|\\s+).+", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern NOTE_PREFIX_PATTERN =
            Pattern.compile("^(note|important|tip|warning|lưu ý|chú ý)\\s*[:：]\\s*(.+)$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern PAGE_MARKER_PATTERN =
            Pattern.compile("^(?:page|trang|p\\.)\\s*\\d+(?:\\s*(?:/|of)\\s*\\d+)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BULLET_PREFIX_PATTERN = Pattern.compile("^[•▪◦●■–—]\\s*(.*)$");
    private static final Pattern LANG_CLASS_PATTERN = Pattern.compile("(?:^|\\s)(?:language-|lang-)([a-zA-Z0-9_+-]+)");

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of("pdf", "docx", "pptx", "md", "markdown", "txt");

    private final AccessPolicyService access;
    private final LlmTheoryDraftGenerator generator;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public record ImportResult(
            String title,
            String body,
            String sourceType,
            String sourceUrl,
            boolean aiFormatted,
            int pageCount,
            int extractedPages,
            List<String> warnings
    ) {}

    private record ExtractedContent(
            String title,
            String rawText,
            String sourceType,
            int pageCount,
            int extractedPages,
            boolean applyProseJoining,
            List<String> warnings
    ) {}

    public ImportResult importFile(
            UUID workspaceId,
            MultipartFile file,
            Integer pageFrom,
            Integer pageTo,
            boolean aiFormat,
            String language
    ) {
        access.requireWorkspaceLecturer(workspaceId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "EMPTY_FILE", "Choose a non-empty file to import.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "FILE_TOO_LARGE",
                    "File exceeds the 20 MB import limit. For large PDFs, upload the chapter or split pages first.");
        }
        String fileName = file.getOriginalFilename() == null ? "lesson.txt" : file.getOriginalFilename().trim();
        String ext = extensionOf(fileName);
        if (!SUPPORTED_EXTENSIONS.contains(ext)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "UNSUPPORTED_FILE_TYPE",
                    "Unsupported file type. Upload PDF, DOCX, PPTX, Markdown (.md), or text (.txt).");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "FILE_READ_FAILED", "Could not read the uploaded file.");
        }
        String stem = stripExtension(fileName);
        ExtractedContent extracted = switch (ext) {
            case "pdf" -> extractPdf(bytes, stem, pageFrom, pageTo);
            case "docx" -> extractDocx(bytes, stem);
            case "pptx" -> extractPptx(bytes, stem);
            case "md", "markdown" -> new ExtractedContent(stem, new String(bytes, StandardCharsets.UTF_8), "MD", 0, 0, false, List.of());
            default -> new ExtractedContent(stem, new String(bytes, StandardCharsets.UTF_8), "TXT", 0, 0, true, List.of());
        };
        return finalizeResult(extracted, null, aiFormat, language);
    }

    public ImportResult importUrl(UUID workspaceId, String url, boolean aiFormat, String language) {
        access.requireWorkspaceLecturer(workspaceId);
        URI currentUri = validatePublicUrl(url);
        HttpResponse<byte[]> response = fetchWithRedirects(currentUri);
        URI finalUri = response.uri() != null ? response.uri() : currentUri;
        String contentType = response.headers().firstValue("content-type").orElse("").toLowerCase(Locale.ROOT);
        String rawPayload = new String(response.body(), StandardCharsets.UTF_8);

        ExtractedContent extracted;
        if (contentType.contains("text/markdown") || contentType.contains("text/plain")) {
            String title = deriveUrlTitle(finalUri, rawPayload);
            extracted = new ExtractedContent(title, rawPayload, "URL", 0, 0, contentType.contains("text/plain"), List.of());
        } else {
            Document doc = Jsoup.parse(rawPayload, finalUri.toString());
            String docTitle = doc.title() != null ? doc.title().trim() : "";
            String markdown = htmlToMarkdown(doc);
            if (markdown.trim().length() < 40) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "URL_CONTENT_EMPTY",
                        "Could not extract readable text from this URL (it may require sign-in or client-side JS rendering).");
            }
            String title = docTitle.isBlank() ? deriveUrlTitle(finalUri, markdown) : truncateTitle(docTitle);
            extracted = new ExtractedContent(title, markdown, "URL", 0, 0, false, List.of());
        }
        return finalizeResult(extracted, finalUri.toString(), aiFormat, language);
    }

    private ImportResult finalizeResult(
            ExtractedContent extracted,
            String sourceUrl,
            boolean aiFormat,
            String language
    ) {
        List<String> warnings = new ArrayList<>(extracted.warnings());
        String body = cleanAndFormatMarkdown(extracted.rawText(), extracted.applyProseJoining());
        String title = extracted.title() == null || extracted.title().isBlank() ? "Imported lesson" : extracted.title().trim();
        boolean aiFormatted = false;

        if (aiFormat) {
            boolean vietnamese = "vi".equalsIgnoreCase(language);
            var formatted = generator.formatImportedContent(title, body, vietnamese);
            if (formatted.isPresent()) {
                var draft = formatted.get();
                if (draft.title() != null && !draft.title().isBlank()) {
                    title = truncateTitle(draft.title().trim());
                }
                body = draft.body();
                aiFormatted = true;
            } else {
                warnings.add("AI structuring unavailable; deterministic Markdown formatting was applied.");
            }
        }

        if (body.length() > MAX_BODY_CHARS) {
            body = body.substring(0, MAX_BODY_CHARS).trim();
            warnings.add("Content truncated to 48,000 characters to fit the lesson limit.");
        }
        return new ImportResult(
                truncateTitle(title),
                body,
                extracted.sourceType(),
                sourceUrl,
                aiFormatted,
                extracted.pageCount(),
                extracted.extractedPages(),
                List.copyOf(warnings)
        );
    }

    private ExtractedContent extractPdf(byte[] bytes, String fallbackTitle, Integer pageFrom, Integer pageTo) {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            int totalPages = doc.getNumberOfPages();
            if (totalPages <= 0) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "PDF_EMPTY", "The PDF file has no pages.");
            }
            int start = pageFrom == null ? 1 : Math.max(1, Math.min(pageFrom, totalPages));
            int capEnd = Math.min(totalPages, start + MAX_PDF_PAGES_PER_IMPORT - 1);
            int requestedEnd = pageTo == null ? totalPages : Math.min(totalPages, pageTo);
            int end = Math.max(start, Math.min(requestedEnd, capEnd));

            List<String> warnings = new ArrayList<>();
            if (requestedEnd > end) {
                warnings.add("Extracted pages " + start + "–" + end + " of " + totalPages + " (max 50 pages per import).");
            }

            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            stripper.setStartPage(start);
            stripper.setEndPage(end);
            String text = stripper.getText(doc);
            if (text == null || text.trim().length() < 20) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "PDF_NO_TEXT_LAYER",
                        "This PDF has no selectable text layer (likely scanned images). Use a text-based PDF or paste the content directly.");
            }

            String metaTitle = doc.getDocumentInformation() != null ? doc.getDocumentInformation().getTitle() : null;
            String title = (metaTitle != null && !metaTitle.isBlank()) ? truncateTitle(metaTitle.trim()) : fallbackTitle;
            return new ExtractedContent(title, text, "PDF", totalPages, end - start + 1, true, warnings);
        } catch (BusinessException error) {
            throw error;
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_PDF", "Could not parse the PDF file.");
        }
    }

    private ExtractedContent extractDocx(byte[] bytes, String fallbackTitle) {
        byte[] documentXml = readZipEntry(bytes, "word/document.xml");
        if (documentXml == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_DOCX",
                    "Invalid DOCX file: word/document.xml was not found.");
        }
        try {
            org.w3c.dom.Document xml = secureDocumentBuilder().parse(new ByteArrayInputStream(documentXml));
            StringBuilder sb = new StringBuilder();
            NodeList bodyNodes = xml.getElementsByTagNameNS("*", "body");
            if (bodyNodes.getLength() > 0) {
                org.w3c.dom.Node body = bodyNodes.item(0);
                NodeList children = body.getChildNodes();
                for (int i = 0; i < children.getLength(); i++) {
                    org.w3c.dom.Node child = children.item(i);
                    if (child.getNodeType() != org.w3c.dom.Node.ELEMENT_NODE) continue;
                    String local = localName(child);
                    if ("p".equals(local)) {
                        String line = extractDocxParagraph(child);
                        if (!line.isBlank()) {
                            sb.append(line).append("\n\n");
                        }
                    } else if ("tbl".equals(local)) {
                        String table = extractDocxTable(child);
                        if (!table.isBlank()) {
                            sb.append(table).append("\n\n");
                        }
                    }
                }
            }
            String result = sb.toString().trim();
            if (result.length() < 10) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "DOCX_EMPTY", "No readable text found in the DOCX document.");
            }
            return new ExtractedContent(fallbackTitle, result, "DOCX", 0, 0, false, List.of());
        } catch (BusinessException error) {
            throw error;
        } catch (Exception error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_DOCX", "Could not read DOCX XML content.");
        }
    }

    private static String extractDocxParagraph(org.w3c.dom.Node paragraph) {
        String text = collectWordText(paragraph).trim();
        if (text.isBlank()) return "";
        String styleVal = "";
        boolean isList = false;
        NodeList children = paragraph.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            org.w3c.dom.Node child = children.item(i);
            if (!"pPr".equals(localName(child))) continue;
            NodeList props = child.getChildNodes();
            for (int j = 0; j < props.getLength(); j++) {
                org.w3c.dom.Node prop = props.item(j);
                String name = localName(prop);
                if ("numPr".equals(name)) {
                    isList = true;
                } else if ("pStyle".equals(name) && prop.getAttributes() != null) {
                    var attr = prop.getAttributes().getNamedItemNS("*", "val");
                    if (attr == null) attr = prop.getAttributes().getNamedItem("w:val");
                    if (attr != null) styleVal = attr.getNodeValue();
                }
            }
        }
        String lowerStyle = styleVal.toLowerCase(Locale.ROOT);
        if (lowerStyle.startsWith("heading") || lowerStyle.startsWith("title")) {
            int level = 2;
            if (lowerStyle.equals("title") || lowerStyle.endsWith("1")) level = 1;
            else if (lowerStyle.endsWith("2")) level = 2;
            else if (lowerStyle.endsWith("3")) level = 3;
            else if (lowerStyle.endsWith("4")) level = 4;
            return "#".repeat(level) + " " + text;
        }
        if (isList || lowerStyle.contains("list")) {
            return "- " + text;
        }
        return text;
    }

    private static String extractDocxTable(org.w3c.dom.Node table) {
        List<List<String>> rows = new ArrayList<>();
        NodeList children = table.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            org.w3c.dom.Node tr = children.item(i);
            if (!"tr".equals(localName(tr))) continue;
            List<String> cells = new ArrayList<>();
            NodeList trChildren = tr.getChildNodes();
            for (int j = 0; j < trChildren.getLength(); j++) {
                org.w3c.dom.Node tc = trChildren.item(j);
                if (!"tc".equals(localName(tc))) continue;
                cells.add(collectWordText(tc).replaceAll("\\s+", " ").replace("|", "\\|").trim());
            }
            if (!cells.isEmpty()) rows.add(cells);
        }
        return formatMarkdownTable(rows);
    }

    private static String collectWordText(org.w3c.dom.Node node) {
        StringBuilder sb = new StringBuilder();
        collectWordTextRecursive(node, sb);
        return sb.toString();
    }

    private static void collectWordTextRecursive(org.w3c.dom.Node node, StringBuilder sb) {
        String local = localName(node);
        if ("t".equals(local)) {
            sb.append(node.getTextContent());
            return;
        }
        if ("tab".equals(local)) {
            sb.append(' ');
            return;
        }
        if ("br".equals(local) || "cr".equals(local)) {
            sb.append('\n');
            return;
        }
        NodeList children = node.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            collectWordTextRecursive(children.item(i), sb);
        }
    }

    private ExtractedContent extractPptx(byte[] bytes, String fallbackTitle) {
        TreeMap<Integer, byte[]> slides = readPptxSlides(bytes);
        if (slides.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_PPTX",
                    "Invalid PPTX file: no slides found under ppt/slides/.");
        }
        StringBuilder sb = new StringBuilder();
        DocumentBuilder builder = secureDocumentBuilder();
        for (var entry : slides.entrySet()) {
            try {
                org.w3c.dom.Document xml = builder.parse(new ByteArrayInputStream(entry.getValue()));
                NodeList paragraphs = xml.getElementsByTagNameNS("*", "p");
                List<String> lines = new ArrayList<>();
                for (int i = 0; i < paragraphs.getLength(); i++) {
                    String line = collectPresentationText(paragraphs.item(i)).trim();
                    if (!line.isBlank()) lines.add(line);
                }
                if (lines.isEmpty()) continue;
                String first = lines.get(0);
                if (first.length() <= 120 && !first.endsWith(".")) {
                    sb.append("## Slide ").append(entry.getKey()).append(": ").append(first).append("\n\n");
                    for (int i = 1; i < lines.size(); i++) {
                        sb.append("- ").append(lines.get(i)).append("\n");
                    }
                } else {
                    sb.append("## Slide ").append(entry.getKey()).append("\n\n");
                    for (String line : lines) {
                        sb.append(line).append("\n\n");
                    }
                }
                sb.append("\n");
            } catch (Exception error) {
                log.debug("Skipping unreadable PPTX slide {}: {}", entry.getKey(), error.getMessage());
            }
        }
        String result = sb.toString().trim();
        if (result.length() < 10) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "PPTX_EMPTY", "No readable text found in the PPTX presentation.");
        }
        return new ExtractedContent(fallbackTitle, result, "PPTX", slides.size(), slides.size(), false, List.of());
    }

    private static String collectPresentationText(org.w3c.dom.Node paragraph) {
        StringBuilder sb = new StringBuilder();
        collectPresentationTextRecursive(paragraph, sb);
        return sb.toString();
    }

    private static void collectPresentationTextRecursive(org.w3c.dom.Node node, StringBuilder sb) {
        String local = localName(node);
        if ("t".equals(local)) {
            sb.append(node.getTextContent());
            return;
        }
        if ("br".equals(local)) {
            sb.append(' ');
            return;
        }
        NodeList children = node.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            collectPresentationTextRecursive(children.item(i), sb);
        }
    }

    private static byte[] readZipEntry(byte[] zipBytes, String targetName) {
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (targetName.equals(entry.getName())) {
                    return readLimited(zis, MAX_XML_BYTES);
                }
            }
            return null;
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_ARCHIVE", "Could not unpack document archive.");
        }
    }

    private static TreeMap<Integer, byte[]> readPptxSlides(byte[] zipBytes) {
        TreeMap<Integer, byte[]> slides = new TreeMap<>(Comparator.naturalOrder());
        int totalRead = 0;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Matcher matcher = SLIDE_NAME_PATTERN.matcher(entry.getName());
                if (!matcher.matches()) continue;
                int remaining = MAX_XML_BYTES - totalRead;
                if (remaining <= 0) break;
                byte[] data = readLimited(zis, remaining);
                totalRead += data.length;
                slides.put(Integer.parseInt(matcher.group(1)), data);
            }
            return slides;
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_ARCHIVE", "Could not unpack PPTX archive.");
        }
    }

    private static byte[] readLimited(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "DOCUMENT_TOO_LARGE",
                        "Document content exceeds maximum allowed size.");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static DocumentBuilder secureDocumentBuilder() {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder();
        } catch (Exception error) {
            throw new IllegalStateException("Failed to initialize hardened XML parser", error);
        }
    }

    static URI validatePublicUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_URL", "Enter a valid http:// or https:// URL.");
        }
        URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_URL", "Invalid URL syntax.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_URL_SCHEME", "Only http:// and https:// URLs are allowed.");
        }
        if (uri.getRawUserInfo() != null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_URL", "URLs with embedded credentials are not allowed.");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_URL", "URL must include a public host.");
        }
        String lowerHost = host.toLowerCase(Locale.ROOT);
        if (lowerHost.equals("localhost") || lowerHost.endsWith(".localhost")
                || lowerHost.endsWith(".local") || lowerHost.endsWith(".internal")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "BLOCKED_HOST", "Local and internal hosts are blocked.");
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "URL_UNREACHABLE", "Could not resolve host: " + host);
        }
        if (addresses.length == 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "URL_UNREACHABLE", "Could not resolve host: " + host);
        }
        for (InetAddress address : addresses) {
            if (isBlockedAddress(address)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "BLOCKED_HOST",
                        "Private, loopback, link-local, or reserved network addresses are blocked.");
            }
        }
        return uri;
    }

    private static boolean isBlockedAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (bytes.length == 4 && address instanceof Inet4Address) {
            int b0 = bytes[0] & 0xFF;
            int b1 = bytes[1] & 0xFF;
            if (b0 == 0) return true; // 0.0.0.0/8
            if (b0 == 100 && (b1 >= 64 && b1 <= 127)) return true; // 100.64.0.0/10 CGNAT
            if (b0 == 169 && b1 == 254) return true; // 169.254.0.0/16 cloud metadata / link-local
        }
        if (bytes.length == 16) {
            if ((bytes[0] & 0xFE) == 0xFC) return true; // fc00::/7 unique local IPv6
        }
        return false;
    }

    private HttpResponse<byte[]> fetchWithRedirects(URI initialUri) {
        URI current = initialUri;
        try {
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(current)
                        .timeout(Duration.ofSeconds(15))
                        .header("User-Agent", "MAVIS-Education-Importer/1.0")
                        .header("Accept", "text/html,text/markdown,text/plain")
                        .GET()
                        .build();
                HttpResponse<InputStream> streamResponse = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                int status = streamResponse.statusCode();
                if (status >= 300 && status < 400) {
                    streamResponse.body().close();
                    if (hop == MAX_REDIRECTS) {
                        throw new BusinessException(ErrorCode.BAD_REQUEST, "TOO_MANY_REDIRECTS", "URL exceeded maximum redirect hops.");
                    }
                    String location = streamResponse.headers().firstValue("location")
                            .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "URL_FETCH_FAILED", "Redirect missing Location header."));
                    current = validatePublicUrl(current.resolve(location).toString());
                    continue;
                }
                if (status < 200 || status >= 300) {
                    streamResponse.body().close();
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "URL_FETCH_FAILED",
                            "URL returned HTTP " + status + ".");
                }
                byte[] payload;
                try (InputStream bodyStream = streamResponse.body()) {
                    payload = readLimited(bodyStream, MAX_URL_BYTES);
                }
                return wrapByteResponse(current, streamResponse, payload);
            }
            throw new BusinessException(ErrorCode.BAD_REQUEST, "TOO_MANY_REDIRECTS", "URL exceeded maximum redirect hops.");
        } catch (BusinessException error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.BAD_REQUEST, "URL_FETCH_FAILED", "URL import was interrupted.");
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "URL_FETCH_FAILED", "Could not fetch content from the URL.");
        }
    }

    private static HttpResponse<byte[]> wrapByteResponse(URI finalUri, HttpResponse<InputStream> original, byte[] payload) {
        return new HttpResponse<>() {
            @Override public int statusCode() { return original.statusCode(); }
            @Override public HttpRequest request() { return original.request(); }
            @Override public java.util.Optional<HttpResponse<byte[]>> previousResponse() { return java.util.Optional.empty(); }
            @Override public java.net.http.HttpHeaders headers() { return original.headers(); }
            @Override public byte[] body() { return payload; }
            @Override public java.util.Optional<javax.net.ssl.SSLSession> sslSession() { return original.sslSession(); }
            @Override public URI uri() { return finalUri; }
            @Override public HttpClient.Version version() { return original.version(); }
        };
    }

    static String htmlToMarkdown(Document doc) {
        doc.select("script, style, noscript, svg, iframe, nav, footer, aside, form, [role=navigation], [aria-hidden=true]").remove();
        Element root = doc.selectFirst("article");
        if (root == null) root = doc.selectFirst("main");
        if (root == null) root = doc.selectFirst("[role=main]");
        if (root == null) root = doc.body();
        if (root == null) return "";

        StringBuilder out = new StringBuilder();
        appendBlockMarkdown(root, out);
        return out.toString().replaceAll("\\n{3,}", "\n\n").trim();
    }

    private static void appendBlockMarkdown(Element el, StringBuilder out) {
        for (Node child : el.childNodes()) {
            if (child instanceof TextNode textNode) {
                String text = textNode.text().trim();
                if (!text.isEmpty()) out.append(text).append("\n\n");
                continue;
            }
            if (!(child instanceof Element childEl)) continue;
            String tag = childEl.tagName().toLowerCase(Locale.ROOT);
            switch (tag) {
                case "h1", "h2", "h3", "h4", "h5", "h6" -> {
                    int level = Integer.parseInt(tag.substring(1));
                    String headingText = inlineText(childEl).trim();
                    if (!headingText.isEmpty()) {
                        out.append("#".repeat(level)).append(" ").append(headingText).append("\n\n");
                    }
                }
                case "p" -> {
                    String pText = inlineText(childEl).trim();
                    if (!pText.isEmpty()) out.append(pText).append("\n\n");
                }
                case "pre" -> {
                    Element codeEl = childEl.selectFirst("code");
                    String lang = detectLanguage(codeEl != null ? codeEl : childEl);
                    String codeText = (codeEl != null ? codeEl.wholeText() : childEl.wholeText()).replaceAll("\\s+$", "");
                    if (!codeText.isBlank()) {
                        out.append("```").append(lang).append("\n").append(codeText).append("\n```\n\n");
                    }
                }
                case "ul", "ol" -> {
                    boolean ordered = tag.equals("ol");
                    int idx = 1;
                    for (Element li : childEl.children()) {
                        if (!li.tagName().equalsIgnoreCase("li")) continue;
                        String itemText = inlineText(li).trim();
                        if (!itemText.isEmpty()) {
                            out.append(ordered ? (idx++) + ". " : "- ").append(itemText).append("\n");
                        }
                    }
                    out.append("\n");
                }
                case "blockquote" -> {
                    String quote = inlineText(childEl).trim();
                    if (!quote.isEmpty()) {
                        for (String line : quote.split("\\r?\\n")) {
                            out.append("> ").append(line.trim()).append("\n");
                        }
                        out.append("\n");
                    }
                }
                case "table" -> {
                    List<List<String>> rows = new ArrayList<>();
                    for (Element tr : childEl.select("tr")) {
                        List<String> cells = new ArrayList<>();
                        for (Element cell : tr.select("> th, > td")) {
                            cells.add(inlineText(cell).replaceAll("\\s+", " ").replace("|", "\\|").trim());
                        }
                        if (!cells.isEmpty()) rows.add(cells);
                    }
                    String table = formatMarkdownTable(rows);
                    if (!table.isBlank()) out.append(table).append("\n\n");
                }
                case "hr" -> out.append("---\n\n");
                default -> appendBlockMarkdown(childEl, out);
            }
        }
    }

    private static String inlineText(Element el) {
        StringBuilder sb = new StringBuilder();
        for (Node child : el.childNodes()) {
            if (child instanceof TextNode textNode) {
                sb.append(textNode.text());
            } else if (child instanceof Element childEl) {
                String tag = childEl.tagName().toLowerCase(Locale.ROOT);
                switch (tag) {
                    case "strong", "b" -> {
                        String inner = inlineText(childEl).trim();
                        if (!inner.isEmpty()) sb.append("**").append(inner).append("**");
                    }
                    case "em", "i" -> {
                        String inner = inlineText(childEl).trim();
                        if (!inner.isEmpty()) sb.append("*").append(inner).append("*");
                    }
                    case "code" -> {
                        String inner = childEl.text().trim();
                        if (!inner.isEmpty()) sb.append("`").append(inner).append("`");
                    }
                    case "a" -> {
                        String label = inlineText(childEl).trim();
                        String href = childEl.absUrl("href");
                        if (!href.isBlank() && (href.startsWith("http://") || href.startsWith("https://"))) {
                            sb.append("[").append(label.isEmpty() ? href : label).append("](").append(href).append(")");
                        } else {
                            sb.append(label);
                        }
                    }
                    case "br" -> sb.append("\n");
                    default -> sb.append(inlineText(childEl));
                }
            }
        }
        return sb.toString();
    }

    private static String detectLanguage(Element el) {
        Matcher matcher = LANG_CLASS_PATTERN.matcher(el.className());
        return matcher.find() ? matcher.group(1).toLowerCase(Locale.ROOT) : "";
    }

    private static String formatMarkdownTable(List<List<String>> rows) {
        if (rows.isEmpty()) return "";
        int cols = rows.stream().mapToInt(List::size).max().orElse(0);
        if (cols == 0) return "";
        StringBuilder sb = new StringBuilder();
        appendTableRow(sb, rows.get(0), cols);
        sb.append("|");
        for (int c = 0; c < cols; c++) sb.append(" --- |");
        sb.append("\n");
        for (int r = 1; r < rows.size(); r++) {
            appendTableRow(sb, rows.get(r), cols);
        }
        return sb.toString().trim();
    }

    private static void appendTableRow(StringBuilder sb, List<String> row, int cols) {
        sb.append("|");
        for (int c = 0; c < cols; c++) {
            String cell = c < row.size() ? row.get(c) : "";
            sb.append(" ").append(cell).append(" |");
        }
        sb.append("\n");
    }

    static String cleanAndFormatMarkdown(String raw, boolean joinBrokenLines) {
        if (raw == null || raw.isBlank()) return "";
        String normalized = raw.replace("\r\n", "\n").replace("\r", "\n").trim();
        List<String> out = new ArrayList<>();
        boolean inCode = false;
        List<String> paragraph = new ArrayList<>();

        for (String rawLine : normalized.split("\n", -1)) {
            String line = rawLine.stripTrailing();
            String trimmed = line.trim();

            if (trimmed.startsWith("```")) {
                flushParagraph(out, paragraph);
                inCode = !inCode;
                out.add(line);
                continue;
            }
            if (inCode) {
                out.add(line);
                continue;
            }
            if (trimmed.isEmpty()) {
                flushParagraph(out, paragraph);
                if (!out.isEmpty() && !out.get(out.size() - 1).isEmpty()) {
                    out.add("");
                }
                continue;
            }
            if (joinBrokenLines && (PAGE_MARKER_PATTERN.matcher(trimmed).matches()
                    || (paragraph.isEmpty() && trimmed.matches("^\\d{1,4}$")))) {
                continue;
            }
            if (trimmed.matches("^#{1,6}\\s+.+")
                    || trimmed.matches("^>\\s?.*")
                    || (trimmed.startsWith("|") && trimmed.endsWith("|"))) {
                flushParagraph(out, paragraph);
                out.add(trimmed);
                continue;
            }
            Matcher bulletMatcher = BULLET_PREFIX_PATTERN.matcher(trimmed);
            if (bulletMatcher.matches()) {
                flushParagraph(out, paragraph);
                out.add("- " + bulletMatcher.group(1));
                continue;
            }
            if (trimmed.matches("^([-*+]|\\d+[.)])\\s+.+")) {
                flushParagraph(out, paragraph);
                out.add(trimmed);
                continue;
            }
            Matcher noteMatcher = NOTE_PREFIX_PATTERN.matcher(trimmed);
            if (noteMatcher.matches()) {
                flushParagraph(out, paragraph);
                out.add("> **" + noteMatcher.group(1).trim() + ":** " + noteMatcher.group(2).trim());
                continue;
            }
            if (CHAPTER_HEADING_PATTERN.matcher(trimmed).matches() || isShortUppercaseHeading(trimmed)) {
                flushParagraph(out, paragraph);
                if (!out.isEmpty() && !out.get(out.size() - 1).isEmpty()) out.add("");
                out.add("## " + trimmed);
                out.add("");
                continue;
            }
            if (joinBrokenLines) {
                paragraph.add(trimmed);
            } else {
                out.add(line);
            }
        }
        flushParagraph(out, paragraph);
        return String.join("\n", out).replaceAll("\\n{3,}", "\n\n").trim();
    }

    private static void flushParagraph(List<String> out, List<String> paragraph) {
        if (paragraph.isEmpty()) return;
        out.add(String.join(" ", paragraph));
        paragraph.clear();
    }

    private static boolean isShortUppercaseHeading(String trimmed) {
        if (trimmed.length() < 4 || trimmed.length() > 70) return false;
        boolean hasUpper = false;
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (Character.isLowerCase(c)) return false;
            if (Character.isUpperCase(c)) hasUpper = true;
        }
        return hasUpper && trimmed.matches("^[\\p{Lu}0-9\\s\\-:&/().]+$");
    }

    private static String localName(org.w3c.dom.Node node) {
        return node.getLocalName() != null ? node.getLocalName() : node.getNodeName();
    }

    private static String extensionOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot >= 0 && dot < fileName.length() - 1
                ? fileName.substring(dot + 1).toLowerCase(Locale.ROOT)
                : "";
    }

    private static String stripExtension(String fileName) {
        int slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
        String base = slash >= 0 ? fileName.substring(slash + 1) : fileName;
        int dot = base.lastIndexOf('.');
        String stem = dot > 0 ? base.substring(0, dot) : base;
        return stem.isBlank() ? "Imported lesson" : truncateTitle(stem);
    }

    private static String deriveUrlTitle(URI uri, String content) {
        for (String line : content.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("# ")) {
                return truncateTitle(trimmed.substring(2).trim());
            }
        }
        String path = uri.getPath();
        if (path != null && !path.isBlank() && !path.equals("/")) {
            String[] parts = path.split("/");
            for (int i = parts.length - 1; i >= 0; i--) {
                if (!parts[i].isBlank()) return truncateTitle(parts[i].replace('-', ' ').replace('_', ' '));
            }
        }
        return truncateTitle(uri.getHost() == null ? "Imported lesson" : uri.getHost());
    }

    private static String truncateTitle(String value) {
        return value.length() > 200 ? value.substring(0, 200).trim() : value;
    }
}
