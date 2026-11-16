# MAVIS — Báo Cáo Kiểm Tra Chuyên Sâu & Master Prompt Chuẩn Hóa Toàn Diện Chức Năng Tiếng Việt (EN | VI) Cho AI Antigravity

Tài liệu này tập trung **100% vào chức năng chuyển đổi ngôn ngữ Tiếng Anh – Tiếng Việt (`EN | VI`)** trên toàn bộ hệ thống **MAVIS (Frontend Next.js + Java Spring Boot Backend)**, giúp khắc phục triệt để tình trạng câu chữ dịch chưa đồng nhất, chỗ dịch chỗ còn nguyên tiếng Anh, đồng thời thiết lập một **kiến trúc đa ngôn ngữ chuẩn mực, dễ mở rộng** để các thành viên khác trong nhóm khi code thêm tính năng mới vẫn giữ được sự đồng bộ hoàn toàn.

---

## PHẦN 1: BÁO CÁO PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ — TẠI SAO BẢN TIẾNG VIỆT HIỆN TẠI CHƯA ĐỒNG NHẤT & CÒN SÓT NHIỀU CHỮ TIẾNG ANH?

Qua kiểm tra chi tiết toàn bộ mã nguồn mới nhất trong `MAVIS-Frontend` và `MAVIS-Platform`, có **10 nguyên nhân kỹ thuật trực tiếp** khiến việc bật công tắc `VI` hiện nay chưa mượt mà và chưa đồng bộ:

### 1. Lỗi `shouldSkipElement` trong `src/lib/i18n/locale-context.tsx` (Dòng 827) chặn dịch toàn bộ phần tử có class `.font-mono`
- **Hiện trạng trong code (`locale-context.tsx` dòng 827)**:
  ```ts
  if (el.closest("code, pre, [data-no-translate], .font-mono")) return true;
  ```
- **Hậu quả**: Trong giao diện MAVIS, rất nhiều nhãn giao diện, huy hiệu trạng thái (Badge), bộ đếm và tiêu đề phụ sử dụng class Tailwind `font-mono` để trình bày kiểu chữ kỹ thuật đẹp mắt. Việc chặn `.font-mono` khiến hàng loạt câu chữ tiếng Anh **bị bỏ qua hoàn toàn không bao giờ dịch**, điển hình như:
  - Trong `communication-panel.tsx` (dòng 94, 98, 222, 314): `(Selected service)`, `(Connected service)`, `2 code reference(s)`, `3 relationship(s)`, `0 Docker/Config` đều nằm trong thẻ có `.font-mono` nên vẫn giữ nguyên tiếng Anh.
  - Trong `dependency-network.tsx` (dòng 1038): Câu hướng dẫn `"One plain line per pair · select for direction, source & evidence"` và `"No matching connections."` nằm trong `<div className="... font-mono">` nên không được dịch.
  - Trong `impact.tsx` (dòng 384, 397, 418, 431, 434, 448, 475): Các nhãn `"2+ Hops"`, `"-2 hops"`, `"1 Hop"`, `"503 / Conn Refused"`, `"Protocol: HTTP"`, `"💥 OUTAGE"`, `"DB / Queues"` đều có `font-mono` nên bị bỏ qua.
- **Cách khắc phục**: Loại bỏ `.font-mono` khỏi điều kiện chặn của `shouldSkipElement`! Chỉ chặn các thẻ chứa mã nguồn thực sự (`CODE`, `PRE`, `SCRIPT`, `STYLE`, `TEXTAREA`, `SVG`) và các phần tử được gắn thuộc tính tường minh `data-no-translate`. Vì hàm `translateStringToVi` chỉ dịch những câu khớp với Từ điển (`EXACT_VI_DICTIONARY`) hoặc Mẫu câu (`PATTERN_REPLACEMENTS`), nên các tên định danh thực tế như `order-service`, `OrderController`, `GET /api/orders` dù nằm trong `.font-mono` cũng sẽ tự động được giữ nguyên 100%.

### 2. Lỗi câu JSX ghép nối nhiều biểu thức (`<strong>`, biến số) bị tách thành các Text Node rời rạc trên DOM
- **Hiện trạng**: Khi viết JSX dạng pha trộn chữ và thẻ con, ví dụ:
  - `<span>Connection evidence for <strong className="font-mono">{subjectName}</strong> ({groups.length} peer(s))</span>` (`communication-panel.tsx` dòng 310)
  - `<span>Select a pair <strong>{subjectName} ↔ ...</strong> to inspect infrastructure and source evidence</span>` (`communication-panel.tsx` dòng 316)
  - `<p><strong className="text-foreground">Source model:</strong> {model.elements.length} elements · {model.edges.length} relationships</p>` (`dependency-network.tsx` dòng 752)
  - `<p>Potential failure propagation if <strong className="text-rose-400 font-mono">{impact.targetName}</strong> becomes unavailable</p>` (`impact.tsx` dòng 357)
- **Hậu quả**: Trình duyệt tạo ra các `Text` node tách rời nhau (ví dụ: `"Connection evidence for "`, `" (3 peer(s))"`, `"Select a pair "`, `" to inspect infrastructure and source evidence"`). Trong khi đó, `PATTERN_REPLACEMENTS` trong `locale-context.tsx` lại viết Regex chờ nguyên cả câu liền mạch `^Connection evidence for (.+) \((\d+) peer\(s\)\)$`, dẫn đến **không một mảnh Text node nào khớp Regex**!
- **Cách khắc phục**:
  1. Sử dụng trực tiếp hàm `t(en, vi)` tại các câu JSX có ghép biến/thẻ `<strong>` trong các component chính để câu tiếng Việt hiển thị trọn vẹn, tự nhiên đúng ngữ pháp.
  2. Bổ sung vào `EXACT_VI_DICTIONARY` và `PATTERN_REPLACEMENTS` các mẫu khớp mảnh ghép rời (fragment matching) như `"Connection evidence for"`, `"Select a pair"`, `"to inspect infrastructure and source evidence"`, `"Potential failure propagation if"`, `"becomes unavailable"`, `"elements ·"`, `"relationships"`, v.v.

### 3. Toàn bộ file `src/features/architecture/three-e-content.ts` và `src/lib/ai/evidence-grounding.ts` đang sinh văn bản cố định bằng tiếng Anh
- **Hiện trạng**:
  - Hàm `selectionSummary(model, id)` (`three-e-content.ts` dòng 33–140) trả về `type` (`"Service / Application Container"`, `"Internal Service Component"`, `"Architectural Relationship"`) và `summary` (`"The model records a declared HTTP dependency..."`, `"The model groups 5 extracted components inside this service. Owned by..."`) hoàn toàn bằng tiếng Anh.
  - Hàm `buildDeterministicThreeESimplified(...)` (`three-e-content.ts` dòng 1149–1218) và `explainEvidenceSnippetSimply(...)` (dòng 962–1018) sinh nội dung 3E mặc định (`explainSimple`, `exploreSimple`, `evaluateSimple`, `grounding.notice`, `snippetNotes`) hoàn toàn bằng tiếng Anh.
  - Ngay cả khi API `/api/ai-diagram-semantics` trả về kết quả tiếng Việt, hàm `normalizeThreeE(parsed3E, tCtx)` trong `src/lib/ai/evidence-grounding.ts` lại ghi đè `grounding.notice` bằng câu tiếng Anh: `"Interpretation of selected evidence only; this is not a complete source or runtime verification."`!
  - Hàm `checkThreeEScopeGuardrail(...)` (`three-e-content.ts` dòng 1346–1405) trả về thông báo từ chối câu hỏi ngoài phạm vi (`refusalMessage`) bằng tiếng Anh ngay cả khi người dùng đang bật `VI`.
- **Cách khắc phục**: Truyền tham số `locale: Locale = "en"` vào tất cả các hàm trong `three-e-content.ts` và `evidence-grounding.ts` để sinh văn bản tiếng Việt chuẩn xác ngay từ gốc.

### 4. Cache AI ở Frontend (`clientThreeEAiCache`, `clientC4EnrichmentCache`, `clientUmlAiCache`) không phân biệt `locale`
- **Hiện trạng**:
  - Trong `selection-three-e.tsx` (dòng 24): `const clientThreeEAiCache = new Map<string, ThreeEAiSimplifiedExplanation>();` chỉ dùng `threeEAiCtx.contextHash` làm khóa lưu cache.
  - Trong `architecture-diagrams.tsx` (dòng 31) và `uml-diagram-workspace.tsx` (dòng 39): `clientC4EnrichmentCache` và `clientUmlAiCache` cũng chỉ dùng `contextHash`.
- **Hậu quả**: Nếu người dùng mở trang khi đang ở `EN`, nội dung giải thích tiếng Anh được lưu vào `Map` theo `contextHash`. Khi người dùng bấm nút chuyển sang `VI`, component đọc lại đúng `contextHash` đó từ `Map` và **hiển thị lại nguyên văn bản tiếng Anh đã cache** mà không gọi lại API với `locale: "vi"`!
- **Cách khắc phục**: Đổi toàn bộ khóa cache ở cả Frontend và API route thành `${contextHash}:${locale}`, và thêm `locale` vào dependency array của `useEffect` gọi `/api/ai-diagram-semantics`.

### 5. `AutoDomTranslator` không theo dõi sự kiện `characterData` và giữ nguyên giá trị cũ trong `originalTextMap` khi React cập nhật State
- **Hiện trạng**:
  - Trong `locale-context.tsx` (dòng 896), `MutationObserver` chỉ cấu hình `{ childList: true, subtree: true }` mà thiếu `characterData: true`.
  - Ở dòng 841: `const orig = originalTextMap.get(current) ?? currentVal;`. Khi một `Text` node đã từng được lưu vào `originalTextMap` (ví dụ lúc đầu là `"Analyzing..."`), sau đó React đổi nội dung của chính `Text` node đó thành `"Completed"`, `originalTextMap.get(current)` vẫn trả về chuỗi cũ `"Analyzing..."`, làm giao diện hiển thị sai trạng thái!
- **Cách khắc phục**: Lưu cấu trúc `{ original: string; lastRendered: string }` trong `originalTextMap`. Nếu `currentVal !== entry.lastRendered` và `currentVal !== entry.original`, nghĩa là React vừa cập nhật nội dung mới cho node đó, ta cập nhật lại `entry.original = currentVal` trước khi dịch sang tiếng Việt; đồng thời bật `characterData: true` cho `MutationObserver`.

### 6. API `/api/ai-diagram-semantics/route.ts` chưa truyền `locale` vào nhánh C4, UML và Sequence Diagram
- **Hiện trạng**: Trong `src/app/api/ai-diagram-semantics/route.ts`, biến `locale` mới chỉ được xử lý ở Branch 3 (`threeEChat`) và Branch 4 (`threeEContext`), còn Branch 0 (`umlContext`), Branch 1 (`c4Context`) và Branch 2 (Sequence `context`) vẫn sinh mô tả bằng tiếng Anh.

### 7. Java Backend (`/api/v1/analyzer/ai/explain`) chưa nhận `locale` nên luôn giải thích bằng tiếng Anh
- **Hiện trạng**: Trong `AiExplainRequestDTO.java`, `AiExplanationServiceImpl.java` và `GroundedFindingExplanation.java`, Backend chưa có trường `locale`. Khi người dùng vào trang **Giải thích AI (`/explain`)** hoặc bấm tạo giải thích chuyên sâu, Java Backend luôn trả về tiếng Anh.
- **Cách khắc phục**: Thêm trường `private String locale;` vào `AiExplainRequestDTO.java`, đưa `locale` vào `buildContextKey(...)` để tách cache `en`/`vi`, và cập nhật cả prompt LLM lẫn hàm `synthesizeDeterministicExplanation(...)` và `GroundedFindingExplanation.java` để xuất bản giải thích tiếng Việt tự nhiên khi `locale = "vi"`.

---

## PHẦN 2: BỘ QUY CHUẨN THUẬT NGỮ SONG NGỮ IT (BILINGUAL IT TERMINOLOGY STANDARD)

Để toàn bộ giao diện MAVIS đọc tự nhiên, chuyên nghiệp như các nền tảng kỹ thuật phần mềm hiện đại và **thống nhất 100% giữa mọi màn hình**, hệ thống áp dụng 3 quy tắc từ vựng bất di bất dịch sau:

### Quy tắc 1: Các thuật ngữ chuyên ngành IT bắt buộc GIỮ NGUYÊN tiếng Anh (Không dịch gượng gạo)
Các từ khóa kỹ thuật sau đây luôn giữ nguyên tiếng Anh khi đứng độc lập hoặc nằm trong câu tiếng Việt:
- **Kiến trúc & Thành phần**: `Service`, `Microservice`, `Container`, `Component`, `Class`, `Interface`, `Enum`, `Package`, `Module`, `Method`, `Endpoint`, `Controller`, `Repository`, `Entity`, `DTO`, `Gateway`, `Proxy`.
- **Giao thức & Hạ tầng**: `API`, `HTTP`, `HTTPS`, `REST`, `gRPC`, `GraphQL`, `Feign`, `WebClient`, `RestTemplate`, `Database`, `Schema`, `Queue`, `Message Broker`, `Topic`, `Channel`, `Kafka`, `RabbitMQ`, `Redis`, `PostgreSQL`, `Docker`, `Docker Compose`, `Dockerfile`, `Runtime`, `Sandbox`, `Preflight`, `Workspace`.
- **Quan sát & Phân tích**: `Snapshot`, `Commit`, `Branch`, `Trace`, `Span`, `Log`, `Token`, `Cache`, `AST`, `C4`, `UML`, `Sequence`, `Activity`, `State`, `Deployment`, `3E (Explain · Explore · Evaluate)`, `Blast Radius`, `Upstream`, `Downstream`, `Hop`, `Payload`, `JWT`, `CORS`, `Webhook`.

### Quy tắc 2: Bảng chuẩn hóa thuật ngữ Tiếng Việt thống nhất toàn hệ thống (1 Khái niệm = 1 Cách dịch duy nhất)
Tuyệt đối không dịch một từ theo nhiều kiểu khác nhau ở các trang khác nhau, và **tuyệt đối không sử dụng bất kỳ từ ngữ mang tính y khoa nào**:

| Thuật ngữ gốc (EN) | Bản dịch chuẩn duy nhất (VI) | Ghi chú quy chuẩn (Nghiêm cấm dịch lệch) |
| :--- | :--- | :--- |
| **Project** | **Dự án** | Không lúc gọi là "Đồ án", lúc gọi là "Dự án" |
| **Workspace / Class** | **Lớp học (Workspace)** hoặc **Lớp học** | Thống nhất trong menu và trang quản lý lớp |
| **Model Version / Revision** | **Phiên bản mô hình / Bản sửa đổi (Revision)** | Luôn dịch `Revision X` là `Bản sửa đổi X` hoặc `Revision X` |
| **Source Snapshot** | **Bản chụp mã nguồn (Snapshot)** | Ngắn gọn trên nút/nhãn: `Snapshot mã nguồn` |
| **Architecture Element / Element** | **Phần tử kiến trúc / Phần tử** | Không dịch lúc là "Thành tố", lúc là "Yếu tố", lúc là "Mục" |
| **Relationship** | **Mối quan hệ** | Khi chỉ cạnh nối kiến trúc giữa 2 phần tử |
| **Connection** | **Kết nối** | Khi chỉ đường nối gom nhóm trên đồ thị mạng |
| **Evidence / Source Evidence** | **Bằng chứng mã nguồn** (hoặc **Bằng chứng**) | Không dịch là "Chứng cứ" hay "Dẫn chứng" |
| **Selected service / Subject** | **Service đang chọn** | Ngắn gọn, rõ nghĩa |
| **Connected service / Peer** | **Service kết nối** (hoặc **Phần tử đối tác**) | Thống nhất trong Cây bằng chứng kết nối |
| **Impact Analysis** | **Phân tích tác động** | Trang `/impact`: `Phân tích tác động thay đổi` |
| **Outage Blast Radius Map** | **Bản đồ phạm vi ảnh hưởng khi gián đoạn (Blast Radius)** | Rõ nghĩa kỹ thuật |
| **Direct Impact / Indirect Impact** | **Tác động trực tiếp / Tác động gián tiếp** | Kèm `(1 hop)` / `(2+ hops)` |
| **Downstream Dependencies** | **Phụ thuộc tầng dưới (Downstream)** | Luôn giữ từ khóa `(Downstream)` để rõ chiều gọi |
| **Upstream Impacted** | **Phần tử tầng trên bị ảnh hưởng (Upstream)** | Luôn giữ từ khóa `(Upstream)` |
| **Evaluation / Architectural Evaluation** | **Đánh giá kiến trúc** | Trang `/evaluation` |
| **Finding / Rule Finding** | **Phát hiện quy tắc (Finding)** | Kết quả kiểm tra theo bộ quy tắc `RULE-01..05` |
| **Diagnostic summary / Diagnostics** | **Tóm tắt kết quả phân tích / Thông tin chi tiết tiến trình** | **TUYỆT ĐỐI KHÔNG** dùng từ y khoa! |
| **Runtime Verification** | **Kiểm thử Runtime** | Trang `/runtime` |
| **Submission / Frozen Submission** | **Bài nộp / Bản chốt bài nộp** | Trang `/submissions` |
| **Reference Architecture** | **Kiến trúc mẫu (Reference)** | Dùng trong trang Giảng viên chấm bài / đối chiếu |

---

## PHẦN 3: MASTER PROMPT GIAO CHO AI ANTIGRAVITY THỰC THI (SAO CHÉP NGUYÊN VĂN ĐỂ CHẠY)

Hãy sao chép toàn bộ khối lệnh dưới đây và gửi cho **Antigravity** để hoàn thiện dứt điểm 100% chức năng Tiếng Việt trên cả Frontend và Backend:

```markdown
# ROLE & OBJECTIVE FOR ANTIGRAVITY AI
You are a Principal Full-Stack Engineer working on the **MAVIS** repository (`MAVIS-Frontend` Next.js 15 App Router + `MAVIS-Platform` Java 21 Spring Boot Backend).
Your objective is to **make the Vietnamese (`EN | VI`) localization 100% complete, consistent, natural, and maintainable across all Frontend and Backend modules**, while preserving all existing features, tests, and layouts.

## STRICT RULES & TERMINOLOGY CONSTRAINTS
1. **ZERO MEDICAL TERMINOLOGY**: Never use medical metaphors or medical words anywhere in code, comments, UI strings, or translations (for example, NEVER translate `"Diagnostic summary"` or `"diagnostics"` using medical terms — always translate `"Diagnostic summary"` as `"Tóm tắt kết quả phân tích"` and `"updated diagnostics"` as `"kết quả phân tích mới nhất"`).
2. **KEEP IT TECHNICAL TERMS IN ENGLISH**: Always keep standard Software Engineering terms in English within Vietnamese text: `Service`, `Microservice`, `Container`, `Component`, `Class`, `Interface`, `Enum`, `Package`, `Method`, `Endpoint`, `API`, `HTTP`, `REST`, `gRPC`, `Feign`, `Database`, `Schema`, `Queue`, `Broker`, `Topic`, `Channel`, `Snapshot`, `Commit`, `Branch`, `Repository`, `Workspace`, `Runtime`, `Sandbox`, `Docker Compose`, `Preflight`, `Trace`, `Span`, `Token`, `Cache`, `AST`, `C4`, `UML`, `3E`, `Blast Radius`, `Upstream`, `Downstream`, `Hop`.
3. **UNIFIED VIETNAMESE DOMAIN VOCABULARY**:
   - `Project` -> `Dự án`
   - `Workspace` (teaching class) -> `Lớp học` (or `Lớp học (Workspace)`)
   - `Model Version` -> `Phiên bản mô hình`
   - `Revision` -> `Bản sửa đổi` (e.g., `Revision 3` -> `Bản sửa đổi 3`)
   - `Element` -> `Phần tử` (or `Phần tử kiến trúc`)
   - `Relationship` -> `Mối quan hệ`
   - `Connection` -> `Kết nối`
   - `Evidence` -> `Bằng chứng` / `Bằng chứng mã nguồn`
   - `Finding` -> `Phát hiện quy tắc`
   - `Impact Analysis` -> `Phân tích tác động`
   - `Runtime Verification` -> `Kiểm thử Runtime`
4. **DO NOT BREAK EXISTING TESTS OR FEATURES**: Ensure all unit/E2E tests (`evidence-grounding.test.cjs`, `GroundedFindingExplanationTest`, etc.) continue to pass when `locale` defaults to `"en"`.

---

## TASK 1: Upgrade Core i18n Engine & `AutoDomTranslator` in `src/lib/i18n/locale-context.tsx`

### 1.1. Fix `shouldSkipElement` in `src/lib/i18n/locale-context.tsx` (Critical Fix)
Currently, `shouldSkipElement` has:
```ts
if (el.closest("code, pre, [data-no-translate], .font-mono")) return true;
```
Because `.font-mono` is used on dozens of UI badges, counters, and labels across `communication-panel.tsx`, `dependency-network.tsx`, `impact.tsx`, and `selection-three-e.tsx`, skipping `.font-mono` blocks translation of all those UI elements!
- **Action**: Update `shouldSkipElement` to:
  ```ts
  function shouldSkipElement(el: Element | null): boolean {
    if (!el) return true;
    const tag = el.tagName;
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "CODE" ||
      tag === "PRE" ||
      tag === "TEXTAREA" ||
      tag === "SVG" ||
      tag === "PATH"
    ) {
      return true;
    }
    if (el.closest("code, pre, script, style, textarea, [data-no-translate]")) {
      return true;
    }
    return false;
  }
  ```
- Because `translateStringToVi` only translates strings that match `EXACT_VI_DICTIONARY` or `PATTERN_REPLACEMENTS`, technical identifiers inside `.font-mono` (like `order-service`, `OrderController`, `GET /api/orders`) will naturally remain untouched unless they are actual English UI phrases!

### 1.2. Fix Dynamic React Text Node Updates in `AutoDomTranslator` (`originalTextMap` + `characterData`)
Currently, `originalTextMap` stores `WeakMap<Node, string>` and `MutationObserver` only observes `{ childList: true, subtree: true }`. When React updates an existing `Text` node dynamically (e.g., changing a counter, status badge, or selected item text), `originalTextMap.get(current)` returns the stale initial string!
- **Action**: Replace `originalTextMap` and `applyDomTranslation` in `src/lib/i18n/locale-context.tsx` with stateful tracking that detects when React changes a `Text` node or attribute:
  ```ts
  interface TrackedTextRecord {
    original: string;
    lastRendered: string;
  }
  const originalTextMap = new WeakMap<Node, TrackedTextRecord>();
  const originalAttrMap = new WeakMap<Element, Map<string, TrackedTextRecord>>();
  let isApplyingDomTranslation = false;

  function applyDomTranslation(root: Node, locale: Locale) {
    if (typeof document === "undefined" || isApplyingDomTranslation) return;
    isApplyingDomTranslation = true;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      while (current) {
        const parent = current.parentElement;
        if (!shouldSkipElement(parent)) {
          const currentVal = current.nodeValue ?? "";
          let record = originalTextMap.get(current);
          if (!record) {
            record = { original: currentVal, lastRendered: currentVal };
            originalTextMap.set(current, record);
          } else if (currentVal !== record.lastRendered && currentVal !== record.original) {
            // React dynamically updated this text node! Update the baseline original text.
            record.original = currentVal;
          }
          const nextVal = locale === "vi" ? translateStringToVi(record.original) : record.original;
          if (currentVal !== nextVal) {
            current.nodeValue = nextVal;
          }
          record.lastRendered = nextVal;
        }
        current = walker.nextNode();
      }

      if (root instanceof Element || root instanceof Document) {
        const elements = root.querySelectorAll("[placeholder], [title], [aria-label]");
        elements.forEach((el) => {
          if (shouldSkipElement(el)) return;
          let attrMap = originalAttrMap.get(el);
          if (!attrMap) {
            attrMap = new Map();
            originalAttrMap.set(el, attrMap);
          }
          for (const attr of ["placeholder", "title", "aria-label"]) {
            const val = el.getAttribute(attr);
            if (!val) continue;
            let rec = attrMap.get(attr);
            if (!rec) {
              rec = { original: val, lastRendered: val };
              attrMap.set(attr, rec);
            } else if (val !== rec.lastRendered && val !== rec.original) {
              rec.original = val;
            }
            const nextVal = locale === "vi" ? translateStringToVi(rec.original) : rec.original;
            if (val !== nextVal) {
              el.setAttribute(attr, nextVal);
            }
            rec.lastRendered = nextVal;
          }
        });
      }
    } finally {
      isApplyingDomTranslation = false;
    }
  }
  ```
- Update `observer.observe(document.body, ...)` in `AutoDomTranslator` to include `characterData: true`:
  ```ts
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  ```

### 1.3. Add Team-Friendly Helper Hook & Expand `EXACT_VI_DICTIONARY` + `PATTERN_REPLACEMENTS`
1. In `LocaleContextValue`, keep `locale`, `setLocale`, `toggleLocale`, `t(en, vi)`, and add `tr(text: string): string` which runs `locale === "vi" ? translateStringToVi(text) : text` so any component can translate dynamic strings or option arrays cleanly.
2. Add the following missing exact strings and fragment strings to `EXACT_VI_DICTIONARY` in `src/lib/i18n/locale-context.tsx` (ensuring summary headings use clear technical Vietnamese):
   ```ts
   // Split JSX text node fragments & newly audited strings across all screens
   "Diagnostic summary": "Tóm tắt kết quả phân tích",
   "Connection evidence for": "Bằng chứng kết nối của",
   "Select a pair": "Chọn một cặp kết nối",
   "to inspect infrastructure and source evidence": "để kiểm tra bằng chứng cấu hình hạ tầng và mã nguồn",
   "Selected service": "Service đang chọn",
   "Connected service": "Service kết nối",
   "Selected": "Đang chọn",
   "Peer": "Đối tác kết nối",
   "One plain line per pair · select for direction, source & evidence": "Mỗi cặp hiển thị một đường nối gọn · bấm vào để xem chiều gọi, nguồn trích xuất & bằng chứng",
   "No matching connections.": "Không có kết nối nào khớp bộ lọc.",
   "No visible connections": "Không có kết nối hiển thị",
   "Source model:": "Mô hình gốc:",
   "Displayed:": "Đang hiển thị:",
   "Connection details": "Chi tiết kết nối",
   "Close connection details": "Đóng chi tiết kết nối",
   "This line groups source relationships, not a single call or observed traffic. Choose an individual relationship for its source evidence and 3E.": "Đường nối này gom nhóm các mối quan hệ trong mã nguồn, không đại diện cho một lệnh gọi đơn lẻ hay lưu lượng thực tế. Hãy chọn từng mối quan hệ bên dưới để xem bằng chứng mã nguồn và phân tích 3E.",
   "Find a relationship": "Tìm kiếm mối quan hệ",
   "Type, source, resolution or ID": "Loại giao thức, nguồn, trạng thái hoặc ID",
   "Direction": "Chiều kết nối",
   "Both directions": "Cả hai chiều",
   "Flagged uncertain — verify the evidence.": "Được đánh dấu chưa chắc chắn — cần kiểm tra lại bằng chứng.",
   "Only grouped metadata is loaded for this relationship. Its individual evidence is not inferred from the group.": "Chỉ có siêu dữ liệu gom nhóm cho mối quan hệ này. Bằng chứng riêng lẻ không được suy diễn tự động từ nhóm.",
   "Inspect evidence & 3E": "Kiểm tra bằng chứng & 3E",
   "No relationships match these connection filters.": "Không có mối quan hệ nào khớp bộ lọc kết nối này.",
   "Previous": "Trước",
   "Next": "Tiếp",
   // Impact Analysis screen (impact.tsx)
   "Full Architecture (Source + Messaging + Deployment)": "Toàn bộ kiến trúc (Mã nguồn + Messaging + Triển khai)",
   "Application & Data Only (Excludes Compose)": "Chỉ Ứng dụng & Dữ liệu (Loại trừ Docker Compose)",
   "Component Granularity (Include Internal Components)": "Mức chi tiết Component (Bao gồm các Component nội bộ)",
   "Strict Confirmed HTTP Policy (Worker Only)": "Chỉ kết nối HTTP đã xác nhận nghiêm ngặt (Worker)",
   "Outage Blast Radius Map": "Bản đồ phạm vi ảnh hưởng khi sự cố (Blast Radius)",
   "Potential failure propagation if": "Phạm vi lan truyền lỗi tiềm ẩn nếu",
   "becomes unavailable": "ngừng hoạt động",
   "🔴 Unavailable": "🔴 Ngừng hoạt động",
   "🟠 Direct impact (1 hop)": "🟠 Tác động trực tiếp (1 hop)",
   "🟡 Indirect impact (2+ hops)": "🟡 Tác động gián tiếp (2+ hops)",
   "🔵 Downstream dependencies": "🔵 Phụ thuộc tầng dưới (Downstream)",
   "2+ Hops": "2+ Hops",
   "1 Hop": "1 Hop",
   "503 / Conn Refused": "503 / Từ chối kết nối",
   "💥 OUTAGE": "💥 GIÁN ĐOẠN",
   "Simulated Outage Target": "Mục tiêu giả lập sự cố",
   "DB / Queues": "DB / Hàng đợi (Queues)",
   "No indirect service impact identified": "Không phát hiện tác động gián tiếp nào",
   "No directly dependent services identified": "Không có Service nào phụ thuộc trực tiếp",
   "No downstream dependencies identified": "Không có phụ thuộc tầng dưới (Downstream)",
   "Inspect 3E": "Xem 3E",
   // Diagrams & UML Workspace (architecture-diagrams.tsx, uml-diagram-workspace.tsx)
   "Diagram type": "Loại sơ đồ",
   "All services": "Tất cả Service",
   "All packages": "Tất cả Package",
   "Package": "Package",
   "Environment": "Môi trường",
   "Element to explore": "Phần tử cần khám phá",
   "Select or search elements…": "Chọn hoặc tìm kiếm phần tử…",
   "Connection to explore": "Kết nối cần khám phá",
   "Select or search connections…": "Chọn hoặc tìm kiếm kết nối…",
   "Classifier to explore": "Lớp / Định danh (Classifier) cần khám phá",
   "Select or search classifiers…": "Chọn hoặc tìm kiếm Classifier…",
   "Relationship to explore": "Mối quan hệ cần khám phá",
   "Select or search relationships…": "Chọn hoặc tìm kiếm mối quan hệ…",
   "Context incomplete · external callers require review": "Sơ đồ ngữ cảnh chưa đầy đủ · cần kiểm tra thêm các tác nhân gọi từ bên ngoài",
   "No confirmed actor interaction is recorded in this revision. HTTP endpoints identify interfaces, not human roles. Runtime traces can support service interactions but do not establish business actors or system ownership. Review and document the system boundary and confirmed actors before treating this as a complete context diagram.": "Chưa ghi nhận tương tác từ tác nhân (Actor) xác thực trong bản sửa đổi này. Các HTTP Endpoint chỉ xác định giao diện kết nối chứ không xác định vai trò người dùng. Dữ liệu Runtime Trace hỗ trợ xác minh giao tiếp giữa các Service nhưng không xác lập tác nhân nghiệp vụ. Hãy rà soát ranh giới hệ thống trước khi xem đây là sơ đồ Context hoàn chỉnh.",
   "Preparing diagram…": "Đang chuẩn bị sơ đồ…",
   "The saved version could not load. Retry before saving.": "Không thể tải phiên bản đã lưu. Vui lòng thử lại trước khi lưu.",
   // Model Editor (model-editor.tsx)
   "Open Diagrams": "Mở sơ đồ kiến trúc",
   "Compare Revisions": "So sánh các bản sửa đổi",
   "No editable elements": "Không có phần tử nào có thể chỉnh sửa",
   "Service Container (Microservice)": "Service Container (Microservice)",
   "Database / Data Store": "Database / Kho dữ liệu",
   "Queue / Message Broker": "Hàng đợi / Message Broker",
   "External System": "Hệ thống bên ngoài (External System)",
   "Internal Component": "Component nội bộ",
   "Class / Interface": "Class / Interface",
   "Service HTTP Call (REST / gRPC)": "Lệnh gọi HTTP giữa các Service (REST / gRPC)",
   "Database Access (Read / Write)": "Truy cập Database (Đọc / Ghi)",
   "Code Dependency": "Phụ thuộc mã nguồn (Code Dependency)",
   "Unclassified": "Chưa phân tầng",
   "Edge / Gateway": "Tầng biên / API Gateway",
   "Domain Service": "Tầng nghiệp vụ (Domain Service)",
   "Platform / Messaging": "Tầng nền tảng / Messaging",
   "Data Persistence": "Tầng lưu trữ dữ liệu (Data Persistence)",
   "Edit Element": "Sửa phần tử",
   "Add Element": "Thêm phần tử",
   "Add Connection": "Thêm kết nối",
   "Remove Item": "Xóa mục",
   "Review & Save Revision": "Xem lại & Lưu bản sửa đổi",
   // Workspaces & Submissions (workspaces/screens.tsx, submissions/screens.tsx)
   "You have no teaching workspaces yet. Create a class above, then add students by their registered email.": "Bạn chưa có lớp học (Workspace) giảng dạy nào. Hãy tạo lớp học ở phía trên, sau đó thêm sinh viên bằng email đã đăng ký.",
   "You have not been added to a class yet. Ask your lecturer to add your registered account email. Students can view assignments and submit work after joining a class.": "Bạn chưa được thêm vào lớp học nào. Vui lòng nhờ giảng viên thêm email tài khoản của bạn vào lớp. Sinh viên có thể xem bài tập và nộp bài sau khi tham gia lớp học.",
   "Select a class under My Workspaces in the left sidebar to view class information.": "Hãy chọn một lớp học trong mục Lớp học của tôi ở thanh bên trái để xem thông tin chi tiết.",
   "No class description added yet.": "Chưa có mô tả cho lớp học này.",
   "Class code": "Mã lớp học",
   "Students enrolled": "Sinh viên theo học",
   "Published assignments": "Bài tập đã giao",
   "Scheduled deadlines": "Hạn nộp đã lên lịch",
   "Class assignments": "Danh sách bài tập trong lớp",
   "Required views": "Các góc nhìn sơ đồ yêu cầu",
   "Reference source": "Nguồn kiến trúc mẫu",
   "Attached": "Đã đính kèm",
   "Student project": "Dự án của sinh viên",
   "Class settings": "Cài đặt lớp học",
   "Filter members": "Lọc thành viên",
   "All roles": "Tất cả vai trò",
   "Workspace members": "Thành viên lớp học",
   "Remove": "Xóa khỏi lớp",
   "Reference architecture elements": "Các phần tử thuộc kiến trúc mẫu",
   "No submitted work yet. Open an assignment in your workspace to submit a model version.": "Chưa có bài nộp nào. Hãy mở một bài tập trong lớp học của bạn để nộp phiên bản mô hình.",
   "No assignments in this workspace. Create an assignment before reviewing submissions.": "Chưa có bài tập nào trong lớp học này. Hãy tạo bài tập trước khi chấm bài nộp.",
   "Assignment to review": "Bài tập cần chấm",
   "Choose a workspace": "Chọn một lớp học",
   "Select a class to review its assignments and student submissions.": "Chọn một lớp học để xem danh sách bài tập và bài nộp của sinh viên.",
   "No students have submitted work for this assignment yet.": "Chưa có sinh viên nào nộp bài cho bài tập này.",
   "Search submissions": "Tìm kiếm bài nộp",
   "Submitted result versions": "Danh sách phiên bản bài nộp",
   "Frozen model": "Mô hình đã chốt",
   "Review result": "Kết quả chấm",
   "Submitted": "Thời gian nộp",
   "Review unavailable": "Chưa có kết quả chấm",
   "Runtime evidence not submitted": "Chưa đính kèm bằng chứng Runtime",
   "This frozen submission does not contain a runtime session.": "Bản chốt bài nộp này không bao gồm phiên chạy thử Runtime.",
   // Notifications (notifications/inbox.tsx)
   "All activity": "Tất cả hoạt động",
   "Submissions & feedback": "Bài nộp & nhận xét",
   "Analysis & models": "Phân tích & mô hình",
   "Runtime sessions": "Phiên chạy Runtime",
   "Account access": "Truy cập tài khoản",
   "System alerts": "Cảnh báo hệ thống",
   "Just now": "Vừa xong",
   "You’re all caught up": "Bạn đã xem hết thông báo",
   "No notifications yet": "Chưa có thông báo nào",
   "There are no unread updates in this view.": "Không có thông báo chưa đọc nào trong chế độ xem này.",
   "Updates about your work and account will appear here.": "Các cập nhật về công việc và tài khoản của bạn sẽ hiển thị tại đây.",
   "Notifications could not be loaded. Your other work is unaffected.": "Không thể tải thông báo. Các công việc khác của bạn không bị ảnh hưởng.",
   "Try again": "Thử lại",
   "Mark all as read": "Đánh dấu tất cả đã đọc",
   "Mark as read": "Đánh dấu đã đọc",
   "Unread": "Chưa đọc",
   "Loading notifications…": "Đang tải thông báo…",
   "View all notifications": "Xem tất cả thông báo",
   "Inbox unavailable": "Hộp thư tạm thời không khả dụng",
   "Your activity inbox": "Hộp thư hoạt động của bạn",
   ```
3. Add these dynamic patterns to `PATTERN_REPLACEMENTS` in `src/lib/i18n/locale-context.tsx`:
   ```ts
   [/^(\d+)\s+peer\(s\)$/i, "$1 phần tử kết nối"],
   [/^\((\d+)\s+peer\(s\)\)$/i, "($1 phần tử kết nối)"],
   [/^(\d+)\s+code reference\(s\)$/i, "$1 tham chiếu mã nguồn"],
   [/^(\d+)\s+relationship\(s\)$/i, "$1 mối quan hệ"],
   [/^(\d+)\s+Docker\/Config$/i, "$1 cấu hình Docker/Config"],
   [/^(\d+)\s+recorded relationship\(s\)\s*·\s*(\d+)\s+direction\(s\)$/i, "$1 mối quan hệ được ghi nhận · $2 chiều"],
   [/^(\d+)\s+distinct evidence reference\(s\)\.$/i, "$1 tham chiếu bằng chứng riêng biệt."],
   [/^Total evidence count unavailable;\s*(\d+)\s+known evidence reference\(s\)\.$/i, "Chưa có tổng số bằng chứng; ghi nhận $1 tham chiếu bằng chứng đã biết."],
   [/^From\s+(.+)$/i, "Từ $1"],
   [/^Source:\s*(.+)\s*·\s*Resolution:\s*(.+)$/i, "Nguồn: $1 · Trạng thái phân giải: $2"],
   [/^Impacted if\s+(.+)\s+changes\s*\((\d+)\)$/i, "Các phần tử bị ảnh hưởng nếu $1 thay đổi ($2)"],
   [/^Direct\s*·\s*1 hop$/i, "Trực tiếp · 1 hop"],
   [/^Indirect\s*·\s*(\d+)\s+hops$/i, "Gián tiếp · $1 hops"],
   [/^-(\d+)\s+hops$/i, "-$1 hops"],
   [/^(\d+)\s+elements within the potential blast radius$/i, "$1 phần tử nằm trong phạm vi ảnh hưởng (Blast Radius)"],
   [/^(\d+)\s+dependent(?:s)?\s*·\s*(\d+)\s+dependenc(?:y|ies)$/i, "$1 phần tử phụ thuộc vào nó · $2 phụ thuộc đầu ra"],
   [/^Protocol:\s*(.+)$/i, "Giao thức: $1"],
   [/^Indirect Impact\s*\((\d+)\)$/i, "Tác động gián tiếp ($1)"],
   [/^Direct Impact\s*\((\d+)\)$/i, "Tác động trực tiếp ($1)"],
   [/^Downstream Dependencies\s*\((\d+)\)$/i, "Phụ thuộc tầng dưới ($1)"],
   [/^(\d+)\s+lecturer\(s\)\s*·\s*(\d+)\s+total members$/i, "$1 giảng viên · tổng cộng $2 thành viên"],
   [/^(\d+)\s+with reference source attached$/i, "$1 bài có đính kèm nguồn kiến trúc mẫu"],
   [/^(\d+)\s+without deadline$/i, "$1 bài không giới hạn thời gian"],
   [/^Status:\s*(.+)$/i, "Trạng thái: $1"],
   [/^Revision\s+(\d+)$/i, "Bản sửa đổi $1"],
   [/^Switch to Revision\s+(\d+)$/i, "Chuyển sang Bản sửa đổi $1"],
   [/^(\d+)\s+unread$/i, "$1 chưa đọc"],
   [/^(\d+)\s+unread updates$/i, "$1 cập nhật chưa đọc"],
   [/^(\d+)m ago$/i, "$1 phút trước"],
   [/^(\d+)h ago$/i, "$1 giờ trước"],
   [/^Showing\s+(\d+)\s+recognized service containers, including infrastructure and isolated services\.$/i, "Đang hiển thị $1 Service Container được nhận diện, bao gồm cả dịch vụ hạ tầng và dịch vụ độc lập."],
   ```

---

## TASK 2: Localize `src/features/architecture/three-e-content.ts` & `src/lib/ai/evidence-grounding.ts`

### 2.1. Add `locale?: "en" | "vi"` Support to `three-e-content.ts`
In `src/features/architecture/three-e-content.ts`:
1. Add Vietnamese maps alongside `ruleNames` and `resultNames`:
   ```ts
   export const ruleNamesVi: Record<string, string> = {
     "RULE-01": "Phụ thuộc vòng (Cyclic dependencies) giữa các Service",
     "RULE-02": "Ranh giới quyền sở hữu dữ liệu (Data ownership) giữa các Service",
     "RULE-03": "Service có độ kết nối thấp hoặc cô lập trong mô hình",
     "RULE-04": "Độ bao phủ bằng chứng mã nguồn cho các mối quan hệ",
     "RULE-05": "Các ánh xạ kiến trúc cần xác minh thêm",
   };
   export const resultNamesVi: Record<string, string> = {
     PASS: "Đạt trong phạm vi đã xác minh",
     VIOLATION: "Phát hiện vi phạm quy tắc",
     NEEDS_REVIEW: "Cần rà soát xác minh",
     NOT_APPLICABLE: "Không áp dụng",
   };
   export function getRuleName(ruleId: string, locale: "en" | "vi" = "en"): string {
     return (locale === "vi" ? ruleNamesVi[ruleId] : ruleNames[ruleId]) ?? ruleNames[ruleId] ?? ruleId;
   }
   export function getResultName(status: string, locale: "en" | "vi" = "en"): string {
     return (locale === "vi" ? resultNamesVi[status] : resultNames[status]) ?? resultNames[status] ?? status;
   }
   ```
2. Update `sourceLabel(evidence, locale: "en" | "vi" = "en")`:
   - When `locale === "vi"`:
     - `RUNTIME` -> `"Quan sát lúc chạy (Runtime)"`
     - `CONFIG` / `COMPOSE` -> `"Từ tệp cấu hình"`
     - `SOURCE` / `AST` / `CODE` -> `"Từ mã nguồn"`
     - `USER` -> `"Người dùng xác nhận"`
     - default -> `"Nguồn chưa phân loại"`
3. Update `selectionSummary(model: ArchitecturalModel, id: string, locale: "en" | "vi" = "en")`:
   - When `locale === "vi"`:
     - Translate edge `type` (`umlRelKind ? "Quan hệ UML · " + umlRelKind : "Mối quan hệ Kiến trúc"`) and `meaning[edge.protocol]` into clear Vietnamese Software Engineering phrasing (keeping `HTTP`, `UML`, `Docker Compose`, `Endpoint`, `Message Channel` in English).
     - Translate node `role` tuples (`SERVICE_CONTAINER` -> `["Service / Application Container", "Đơn vị Service hoặc ứng dụng có thể triển khai được nhận diện trong mô hình."]`, `COMPONENT` -> `["Component nội bộ của Service", "Component được trích xuất từ mã nguồn; hãy kiểm tra vai trò kiến trúc của nó trong ngữ cảnh."]`, `DATABASE` -> `["Kho dữ liệu Logic (Logical Datastore)" / "Database · Cần xác minh phạm vi", ...]`, `MESSAGE_CHANNEL` -> `["Kênh thông điệp (Message Channel)", ...]`, `QUEUE_BROKER` -> `["Hạ tầng Message Broker", ...]`, `EXTERNAL_SYSTEM` -> `["Hệ thống bên ngoài (External System)", ...]`).
     - Translate `The model groups ${children.length} extracted components inside this service.` -> `"Mô hình gom nhóm ${children.length} Component trích xuất từ mã nguồn bên trong Service này."` and `Owned by ${owner.name}.` -> `"Thuộc về ${owner.name}."`.
4. Update `explainEvidenceSnippetSimply(item, subjectTitle, locale: "en" | "vi" = "en")`:
   - When `locale === "vi"`, return natural Vietnamese explanations for each category:
     - Runtime: `"Bằng chứng Runtime Trace tại ${loc}: ghi nhận lệnh gọi, độ trễ và mã trạng thái phản hồi của ${target}."`
     - Config/Compose: `"Bằng chứng cấu hình hạ tầng (${loc}): khai báo thiết lập Container, biến môi trường, cổng mạng hoặc kết nối Database / Message Broker cho ${target}."`
     - Controller: `"Bằng chứng điểm vào API (${loc}): tiếp nhận HTTP request đầu vào và chuyển tiếp xử lý xuống tầng nghiệp vụ (Service) của ${target}."`
     - Saga/Messaging: `"Bằng chứng giao tiếp sự kiện bất đồng bộ (${loc}): phát (publish) hoặc tiêu thụ (consume) các thông điệp/sự kiện liên Service liên quan đến ${target}."`
     - Entity/Repository: `"Bằng chứng tầng lưu trữ dữ liệu (${loc}): định nghĩa ánh xạ Entity hoặc các thao tác truy vấn Database qua Repository cho ${target}."`
     - Service: `"Bằng chứng tầng xử lý nghiệp vụ (${loc}): hiện thực hóa logic nghiệp vụ cốt lõi và điều phối giao dịch (transaction) cho ${target}."`
     - Build: `"Khai báo phụ thuộc gói xây dựng (${loc}): chỉ định các thư viện và module phụ thuộc được ${target} sử dụng."`
     - Default: `"Bằng chứng mã nguồn tại ${loc} minh họa trực tiếp khai báo và hành vi của ${target}."`
5. Update `buildDeterministicThreeESimplified(model, ctx, concreteEvidences, matchingFindings, locale: "en" | "vi" = "en")`:
   - When `locale === "vi"`, generate `explainSimple`, `exploreSimple`, `evaluateSimple`, `grounding.notice`, and `snippetNotes` in clean Vietnamese!
6. Update `checkThreeEScopeGuardrail(question, tCtx, locale: "en" | "vi" = "en")`:
   - When `locale === "vi"`, return Vietnamese `refusalMessage` for both `"off-topic"` and `"wrong-service"`:
     - Off-topic: `"Tôi chỉ trả lời các câu hỏi về kiến trúc phần mềm, bằng chứng mã nguồn, phụ thuộc kết nối và đánh giá thiết kế của \"${tCtx.title}\" (${tCtx.type}). Vui lòng đặt câu hỏi xoay quanh phần tử đang chọn."`
     - Wrong-service: `"Bạn đang chọn \"${tCtx.title}\", nhưng câu hỏi lại đề cập đến \"${foreignMatch}\". Vui lòng bấm chọn \"${foreignMatch}\" trên đồ thị trước, hoặc hỏi về \"${tCtx.title}\" cùng các kết nối trực tiếp của nó."`

### 2.2. Update `normalizeThreeE` in `src/lib/ai/evidence-grounding.ts`
- Inspect `src/lib/ai/evidence-grounding.ts` where `normalizeThreeE(candidate, context, locale?: "en" | "vi")` constructs `grounding.notice` and fallback `explainSimple` / `exploreSimple` / `evaluateSimple`.
- Add optional `locale: "en" | "vi" = "en"` parameter (defaulting to `"en"` so all existing tests in `evidence-grounding.test.cjs` pass 100% unchanged!).
- When `locale === "vi"`, set the `grounding.notice` to:
  - `PARTIAL_SOURCE`: `"Chỉ diễn giải dựa trên các đoạn mã bằng chứng đang chọn; đây chưa phải là xác minh toàn bộ mã nguồn hoặc Runtime."`
  - `MODEL_ONLY`: `"Chỉ có siêu dữ liệu mô hình. Chưa có đoạn mã nguồn trích xuất trực tiếp; hành vi chi tiết và vai trò nghiệp vụ chưa được xác lập."`

---

## TASK 3: Fix Cache Keys & Mixed-Language Sentences in `selection-three-e.tsx`, `communication-panel.tsx`, `connection-details-panel.tsx`, and `dependency-network.tsx`

### 3.1. `src/features/architecture/selection-three-e.tsx`
1. Pass `locale` into `buildThreeESubjectContext`, `buildDeterministicThreeESimplified(..., locale)`, `explainEvidenceSnippetSimply(..., locale)`, `checkThreeEScopeGuardrail(q, threeEAiCtx, locale)`, `getRuleName(ruleId, locale)`, `getResultName(status, locale)`, and `sourceLabel(item, locale)`.
2. Fix `clientThreeEAiCache` key to include `locale`:
   ```ts
   const cacheKey = `${threeEAiCtx.contextHash}:${locale}`;
   const cached = clientThreeEAiCache.get(cacheKey);
   ```
   And save under `clientThreeEAiCache.set(cacheKey, data.threeE);`.
3. Pass `locale` when calling `execute("explain", { ...request, locale })` so Java Backend also receives the active language!

### 3.2. `src/features/architecture/communication-panel.tsx`
Use `useLocale()` (`const { t } = useLocale();`) directly in `CommunicationPanel` and `SnippetList` so every badge and composite sentence renders in natural Vietnamese without split-node mismatches:
- Line 94: `{prefixLabel} ({isSubject ? t("Selected service", "Service đang chọn") : t("Connected service", "Service kết nối")}):`
- Line 98: `{items.length} {t("code reference(s)", "tham chiếu mã nguồn")}`
- Line 107: `{t("No direct AST code line recorded in this service (inferred from peer or configuration).", "Chưa ghi nhận dòng mã AST trực tiếp tại Service này (được suy ra từ Service đối tác hoặc tệp cấu hình).")}`
- Line 218: `{t("Selected", "Đang chọn")}` / `{t("Peer", "Đối tác kết nối")}`
- Line 222: `{group.edgeCount} {t("relationship(s)", "mối quan hệ")}`
- Line 242: `{t("Open in 3E", "Mở trong 3E")}`
- Line 252: `1. {t("Docker & Configuration Evidence", "Bằng chứng Docker & Cấu hình")} ({group.dockerAndConfigEvidences.length})`
- Line 282: `2. {t("Source Code Evidence (Class / Controller / Client)", "Bằng chứng Mã nguồn (Class / Controller / Client)")} ({group.subjectCodeEvidences.length + group.peerCodeEvidences.length})`
- Line 309:
  ```tsx
  <span>
    {t("Connection evidence for", "Bằng chứng kết nối của")}{" "}
    <strong className="font-mono text-foreground">{subjectName}</strong> (
    {groups.length} {t("peer(s)", "phần tử kết nối")})
  </span>
  ```
- Line 314:
  ```tsx
  <Badge variant="outline" className="font-mono text-[10px]">
    {groups.reduce((acc, g) => acc + g.dockerAndConfigEvidences.length, 0)}{" "}
    {t("Docker/Config", "Docker/Cấu hình")} ·{" "}
    {groups.reduce((acc, g) => acc + g.subjectCodeEvidences.length + g.peerCodeEvidences.length, 0)}{" "}
    {t("Code", "Mã nguồn")}
  </Badge>
  ```
- Line 316:
  ```tsx
  <p className="text-[11px] text-muted-foreground">
    {t("Select a pair", "Bấm vào một cặp")}{" "}
    <strong className="text-foreground">{subjectName} ↔ ...</strong>{" "}
    {t(
      "to inspect infrastructure and source evidence",
      "để mở xem chi tiết bằng chứng cấu hình hạ tầng và mã nguồn",
    )}
  </p>
  ```

### 3.3. `src/features/architecture/connection-details-panel.tsx` & `dependency-network.tsx`
- In `connection-details-panel.tsx`, import `useLocale()` and wrap the header counters, search input, direction select options (`Both directions` -> `Cả hai chiều`, `From ${name}` -> `Từ ${name}`), and button `Inspect evidence & 3E` -> `Kiểm tra bằng chứng & 3E` with `t(...)`.
- In `dependency-network.tsx`, import `useLocale()` and wrap the summary bar (`Source model: ... elements · ... relationships` and `Displayed: ... elements · ... visible connections · ... underlying relationships`) with `t(...)` so there are zero half-English half-Vietnamese sentences above the canvas.

---

## TASK 4: Localize `/api/ai-diagram-semantics/route.ts` Across All 5 Branches (UML, C4, Sequence, 3E Context, 3E Chat)

In `src/app/api/ai-diagram-semantics/route.ts`:
1. Parse `const reqLocale = body.locale === "vi" ? "vi" : "en";` at the top of `POST(req)` so all branches (`umlContext`, `c4Context`, `context` for Sequence, `threeEChat`, and `threeEContext`) have access to `reqLocale`.
2. In Branch 0 (`umlContext`), Branch 1 (`c4Context`), and Branch 2 (Sequence `context`):
   - Append a language instruction to their system prompts when `reqLocale === "vi"`:
     `"IMPORTANT LANGUAGE REQUIREMENT: Write all human-readable descriptions, flowSummaries, responsibilities, and notes in natural, clear VIETNAMESE (Tiếng Việt), while keeping technical identifiers, class names, method names, and protocols (HTTP, REST, gRPC, Kafka) in English."`
   - In `architecture-diagrams.tsx`, `uml-diagram-workspace.tsx`, and `scenario-diagram.tsx`, pass `locale` in the `POST /api/ai-diagram-semantics` request body and include `:${locale}` in `clientC4EnrichmentCache` and `clientUmlAiCache` keys!
3. In Branch 4 (`threeEContext`), pass `reqLocale` into `normalizeThreeE(parsed3E, tCtx, reqLocale)` so that when `reqLocale === "vi"`, `normalizeThreeE` preserves or sets Vietnamese `grounding.notice` instead of overwriting it with English!

---

## TASK 5: Localize Java Backend AI Explanations (`AiExplainRequestDTO.java`, `AiExplanationServiceImpl.java`, `GroundedFindingExplanation.java`) & Frontend `/explain` Page

### 5.1. Add `locale` Field to `AiExplainRequestDTO.java`
In `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/aiexplain/dto/AiExplainRequestDTO.java`:
```java
/**
 * Optional UI language preference ("en" or "vi"). Defaults to "en".
 */
private String locale;
```

### 5.2. Update `AiExplanationServiceImpl.java` to Support Vietnamese (`"vi"`)
In `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/aiexplain/service/impl/AiExplanationServiceImpl.java`:
1. Add helper:
   ```java
   private boolean isVietnamese(AiExplainRequestDTO request) {
       return request != null && "vi".equalsIgnoreCase(request.getLocale());
   }
   ```
2. In `buildContextKey(...)`, append `:lang=vi` when `isVietnamese(request)` is true (keep the existing key format unchanged when `"en"` or null so existing unit tests pass without any hash changes!).
3. In `callLiveLlm(...)`:
   - When `isVietnamese(request)` is true, instruct the LLM in `systemPrompt`:
     `"Write explanationText in natural, professional VIETNAMESE (Tiếng Việt) for Software Engineering students and lecturers. Keep technical identifiers, service names, class names, endpoints, and standard IT terms (Service, Component, Controller, Repository, Endpoint, HTTP, REST, Docker Compose, Database, Queue, Trace, Span) in English. Do NOT use any medical terminology."`
4. In `synthesizeDeterministicExplanation(...)`:
   - When `isVietnamese(request)` is true, generate the grounded markdown sections in clear Vietnamese:
     - `### Giải thích Kiến trúc Dựa trên Bằng chứng (Grounded Synthesis)`
     - `#### 1. Vai trò Kiến trúc & Mối quan hệ Phụ thuộc`
     - `#### 2. Bằng chứng Mã nguồn & Cấu hình đã Xác minh`
     - `#### 3. Trả lời Câu hỏi Trọng tâm` (if `userQuestion` is present)
     - `#### 4. Lưu ý Thiết kế & Điểm cần Rà soát`
   - Also localize `epistemicBadge` when `isVietnamese(request)`:
     - `"Evidence-Grounded Synthesis (No External LLM Key)"` -> `"Tổng hợp từ Bằng chứng Mã nguồn (Chế độ Offline)"`
     - `"Evidence-Grounded Synthesis (Fallback — LLM Quota/Network Unavailable)"` -> `"Tổng hợp từ Bằng chứng Mã nguồn (Dự phòng khi LLM quá tải)"`
     - `"Live LLM Grounded Synthesis"` -> `"Tổng hợp Chuyên sâu bằng AI (Live LLM)"`

### 5.3. Update `GroundedFindingExplanation.java` to Support Vietnamese (`"vi"`)
In `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/aiexplain/service/impl/GroundedFindingExplanation.java`:
- Check `boolean isVi = "vi".equalsIgnoreCase(request.getLocale());`.
- Set `context.put("language", isVi ? "vi" : "en");` (since `context` is hashed into `key`, this automatically separates cache entries between `"en"` and `"vi"` while keeping `"en"` hashes 100% identical for `GroundedFindingExplanationTest`!).
- When `isVi` is true, populate `summary`, `whyItMatters`, `unknowns`, `nextSteps`, and `epistemicBadge` (`"Giải thích Quy tắc Dựa trên Bằng chứng"`) in natural Vietnamese (avoiding any medical terms — translate `"Re-run architectural evaluation to obtain updated diagnostics."` as `"Hãy chạy lại đánh giá kiến trúc để cập nhật kết quả kiểm tra mới nhất."`).

### 5.4. Pass `locale` from Frontend `explain/components.tsx` and `java-operations.ts`
- In `src/features/explain/components.tsx` (`AIExplanationPanel`), pass `locale` in `explain.mutate({ ...payload, locale })`.
- In `src/lib/api/java-operations.ts` (`case "explain":`), forward `locale: p.locale` in the `POST /v1/analyzer/ai/explain` JSON body.

---

## TASK 6: Polish Remaining Screens (`impact.tsx`, `model-editor.tsx`, `runtime/screens.tsx`, `admin/screens.tsx`)

1. **`src/features/impact/impact.tsx`**:
   - Import `useLocale()` and localize `SCOPE_OPTIONS`, `targetOptions` sublabel (`${incoming} phần tử phụ thuộc · ${outgoing} phụ thuộc đầu ra`), `BlastRadiusVisualMap` headers/badges, and `DetailPanel` titles (`Impacted if ${impact.targetName} changes` -> `Các phần tử bị ảnh hưởng nếu ${impact.targetName} thay đổi`).
2. **`src/features/architecture/model-editor.tsx`**:
   - Import `useLocale()` and localize `ELEMENT_TYPE_OPTIONS`, `RELATION_TYPE_OPTIONS`, `LAYER_OPTIONS`, the historical revision banner (`You are inspecting historical Revision X...` -> `Bạn đang xem Bản sửa đổi lịch sử X. Các bản sửa đổi mới phải được tạo từ bản mới nhất (Bản sửa đổi Y).`), and mode tabs.
3. **`src/features/runtime/screens.tsx`**:
   - Ensure `"Diagnostic summary"` is translated as `"Tóm tắt kết quả phân tích"` (using clear technical phrasing).

---

## TASK 7: Verification Checklist Before Finishing
1. Run `npm run typecheck` and `npm test` (including `evidence-grounding.test.cjs`) in `MAVIS-Frontend`.
2. Run `mvn test` in `MAVIS-Platform/mavis-be` (verifying `GroundedFindingExplanationTest` passes).
3. Verify in browser with `VI` active:
   - Top bar, left sidebar, user role menu, notification bell popover, and `/notifications` page are 100% in natural Vietnamese.
   - Architecture Graph (`/architecture`): Top summary bar, Connection Details drawer, Communication Evidence Tree (`Selected service`, `Connected service`, `X code reference(s)`, `X relationship(s)`), and 3E Inspector tabs (`Explain`, `Explore`, `Evaluate`, `Ask AI`) display 100% in natural Vietnamese without any `.font-mono` labels stuck in English.
   - Switching `EN -> VI -> EN` updates all text immediately without stale cache or mixed-language sentences.
```
