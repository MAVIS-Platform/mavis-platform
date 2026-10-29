"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "vi";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (enText: string, viText?: string) => string;
}

const STORAGE_KEY = "mavis.locale";

export const EXACT_VI_DICTIONARY: Record<string, string> = {
  // Navigation & AppShell Header
  "Overview": "Tổng quan",
  "Projects": "Dự án",
  "Source Snapshots": "Bản chụp mã nguồn",
  "Snapshots": "Bản chụp (Snapshots)",
  "Analysis History": "Lịch sử phân tích",
  "Architecture": "Kiến trúc",
  "Architecture Graph": "Đồ thị kiến trúc",
  "Architecture Graph Explorer": "Khám phá Đồ thị Kiến trúc",
  "Graph Explorer": "Đồ thị Kiến trúc",
  "Architecture Diagrams": "Sơ đồ Kiến trúc (C4/UML)",
  "Diagrams": "Sơ đồ C4 & UML",
  "Model Editor": "Chỉnh sửa Mô hình",
  "Compare Revisions": "So sánh Phiên bản",
  "Compare": "So sánh",
  "Evaluation": "Đánh giá quy tắc",
  "Architecture Evaluation": "Đánh giá Kiến trúc",
  "Impact Analysis": "Phân tích tác động",
  "Change Impact Analysis": "Phân tích Tác động Thay đổi & Sự cố",
  "AI Explanation": "Giải thích AI (3E)",
  "AI explanation": "Giải thích AI (3E)",
  "Runtime": "Kiểm thử Runtime",
  "Runtime Configuration": "Cấu hình Runtime Sandbox",
  "Runtime Scenarios": "Kịch bản Runtime",
  "Runtime Sessions": "Phiên chạy Runtime & Trace",
  "Workspaces": "Lớp học / Không gian làm việc",
  "Assignments": "Bài tập lớn",
  "Submissions": "Bài nộp",
  "Admin": "Quản trị hệ thống",
  "Administration": "Quản trị hệ thống",
  "Users & Roles": "Người dùng & Phân quyền",
  "System Health": "Sức khỏe hệ thống",
  "Audit Logs": "Nhật ký hệ thống",
  "Notifications": "Thông báo",
  "Profile": "Hồ sơ cá nhân",
  "Sign out": "Đăng xuất",
  "Log out": "Đăng xuất",
  "Student / Individual Learner": "Sinh viên / Người học cá nhân",
  "Lecturer": "Giảng viên",
  "System Admin": "Quản trị viên",

  // Project Overview & Snapshots
  "Analyze Source": "Phân tích mã nguồn",
  "Analyze Source Snapshot": "Phân tích bản chụp mã nguồn",
  "Analyze Snapshot": "Phân tích bản chụp",
  "Import Source": "Nhập mã nguồn",
  "Import Snapshot": "Nhập mã nguồn mới",
  "Services": "Số lượng Service",
  "Connections": "Kết nối",
  "Architecture revisions": "Phiên bản kiến trúc",
  "Source snapshots": "Bản chụp mã nguồn",
  "Compare revisions →": "So sánh các phiên bản →",
  "Latest": "Mới nhất",
  "View": "Xem",
  "Open →": "Mở →",
  "Retry": "Thử lại",
  "No architecture revisions yet.": "Chưa có phiên bản kiến trúc nào.",
  "Source snapshots & analysis runs": "Bản chụp mã nguồn & Lượt phân tích",
  "No source snapshots imported yet.": "Chưa nhập bản chụp mã nguồn nào.",
  "Project Not Analyzed Yet": "Dự án chưa được phân tích",
  "No architecture model has been generated for this project yet. Run snapshot analysis to extract architecture models, components, and diagrams.":
    "Chưa có mô hình kiến trúc nào được tạo cho dự án này. Hãy chạy phân tích bản chụp mã nguồn để trích xuất kiến trúc, thành phần và sơ đồ.",
  "Just imported": "Vừa nhập",
  "ZIP upload": "Tải lên file ZIP",
  "Branch / Commit": "Nhánh / Commit",
  "Analysis status": "Trạng thái phân tích",
  "Generated revisions": "Phiên bản được tạo",
  "Actions": "Thao tác",
  "Analyzing…": "Đang phân tích…",
  "Opening Graph…": "Đang mở đồ thị…",
  "not analyzed": "chưa phân tích",
  "completed": "hoàn tất",
  "failed": "thất bại",
  "running": "đang chạy",
  "pending": "đang chờ",
  "Total analysis runs": "Tổng số lần phân tích",
  "Completed runs": "Phân tích thành công",
  "Failed runs": "Phân tích thất bại",
  "Published revisions": "Phiên bản đã xuất bản",
  "Diagnostic summary": "Tóm tắt chẩn đoán",
  "Output revision": "Phiên bản đầu ra",
  "No model published": "Chưa có mô hình",
  "Open Diagrams": "Mở Sơ đồ",
  "Open Graph": "Mở Đồ thị",
  "Re-run analysis": "Phân tích lại",

  // Dependency Network & Graph Controls
  "Analysis": "Phân tích",
  "✦ Explore": "✦ Khám phá",
  "Search service…": "Tìm kiếm service…",
  "Return to selection": "Quay lại phần đang chọn",
  "Zoom in": "Phóng to",
  "Zoom out": "Thu nhỏ",
  "Fit graph — show the entire graph": "Căn vừa khung hình — hiển thị toàn bộ đồ thị",
  "Fullscreen — expand the workspace": "Toàn màn hình — mở rộng không gian làm việc",
  "Exit fullscreen (Esc)": "Thoát toàn màn hình (Esc)",
  "Graph guide": "Hướng dẫn sử dụng đồ thị",
  "Move & zoom": "Di chuyển & Phóng to/Thu nhỏ",
  "Inspect a connection": "Kiểm tra kết nối & Bằng chứng",
  "Keyboard": "Phím tắt bàn phím",
  "Explore mode": "Chế độ Khám phá (Explore)",
  "Analysis mode": "Chế độ Phân tích (Analysis)",
  "Graph controls": "Bộ lọc đồ thị",
  "Graph elements (keyboard navigation)": "Danh sách phần tử đồ thị (điều hướng bàn phím)",
  "Graph options": "Tùy chọn hiển thị đồ thị",
  "Relationship origin": "Nguồn gốc mối quan hệ",
  "All relationships": "Tất cả mối quan hệ",
  "Source and configuration": "Mã nguồn & Cấu hình (Static)",
  "Deployment dependencies": "Phụ thuộc triển khai (Docker Compose)",
  "Runtime observations": "Quan sát thực thi (Runtime Trace)",
  "Expand service internals": "Mở rộng thành phần bên trong Service",
  "Collapse service internals": "Thu gọn thành phần bên trong Service",
  "Architecture Atlas": "Bản đồ Kiến trúc (Architecture Atlas)",
  "No elements available for this filter.": "Không có phần tử nào khớp với bộ lọc hiện tại.",
  "Service": "Service (Dịch vụ)",
  "Data store": "Cơ sở dữ liệu",
  "Messaging": "Hàng đợi / Messaging",
  "Component": "Component (Thành phần)",
  "External System": "Hệ thống ngoài",
  "Unknown": "Chưa phân loại",
  "One plain line per pair · select for direction, source & evidence":
    "Mỗi cặp hiển thị 1 đường nối gộp · Bấm vào đường nối hoặc node để xem chiều gọi, mã nguồn & bằng chứng",

  // 3E Inspector & Communication Panel (A <-> B)
  "Architecture Inspector · 3E": "Trình kiểm tra Kiến trúc · 3E",
  "Connection details": "Chi tiết kết nối",
  "Model context only": "Chỉ có thông tin mô hình",
  "Source context attached": "Đã đính kèm bằng chứng mã nguồn",
  "Explain": "Giải thích (Explain)",
  "Evidence": "Bằng chứng (Evidence)",
  "Evaluate": "Đánh giá (Evaluate)",
  "Understand this selection": "Hiểu về phần tử đang chọn",
  "Updating": "Đang cập nhật…",
  "Inspect source evidence": "Xem bằng chứng mã nguồn chi tiết",
  "Ask a follow-up": "Hỏi thêm AI về phần tử này",
  "Optional +": "Tùy chọn +",
  "Ask about this selection": "Đặt câu hỏi trong phạm vi phần tử đang chọn",
  "Clear chat": "Xóa hội thoại",
  "You": "Bạn",
  "AI is responding…": "AI đang trả lời…",
  "What does this connection mean?": "Kết nối này hoạt động như thế nào?",
  "Ask AI": "Hỏi AI",
  "Trace it to the source": "Truy vết tới mã nguồn (Source Evidence)",
  "Inspect the caller, receiver and configuration snippets attached to this selection.":
    "Kiểm tra đoạn code bên gọi (caller), bên nhận (receiver) và file cấu hình của phần tử đang chọn.",
  "Saved snippets are source evidence. Metadata previews are reconstructions. Static evidence does not prove runtime execution.":
    "Đoạn code đã lưu là bằng chứng trực tiếp từ mã nguồn. Bản xem trước metadata là dữ liệu tái tạo từ AST.",
  "Choose one member relationship": "Chọn một mối quan hệ thành phần",
  "Loading saved evidence…": "Đang tải bằng chứng mã nguồn…",
  "Retry evidence": "Tải lại bằng chứng",
  "Selection details & relationships": "Chi tiết phần tử & Danh sách quan hệ",
  "Assess what is supported": "Đánh giá kiến trúc & Rủi ro",
  "Assumptions & unknowns": "Giả định & Điểm chưa xác minh",
  "Unverified inference: ": "Suy luận chưa xác minh: ",
  "Unknown: ": "Chưa xác định: ",
  "Review supporting evidence": "Xem lại bằng chứng đối chiếu",
  "- Docker / Infrastructure & Connectivity:": "- Docker / Hạ tầng & Kết nối mạng:",
  "No direct Docker Compose declaration is available; this connection is recorded at code or API level.":
    "Không có khai báo trực tiếp trong Docker Compose; kết nối này được ghi nhận ở tầng Code hoặc API.",
  "Selected service": "Service đang chọn - Chủ thể",
  "Connected service": "Service kết nối - Đối tác",
  "File & Line:": "File & Dòng:",
  "No source file or snippet is recorded for this reference.":
    "Chưa có file hoặc đoạn code nào được ghi nhận cho tham chiếu này.",
  "Contract & resolution details": "Chi tiết hợp đồng giao tiếp (Feign / HTTP Contract)",
  "Inspect relationship evidence": "Xem bằng chứng của mối quan hệ này",
  "Inspect evidence & 3E": "Xem bằng chứng & Phân tích 3E",
  "Find a relationship": "Tìm kiếm mối quan hệ",
  "Direction": "Chiều kết nối",
  "Both directions": "Cả hai chiều",
  "Previous": "Trước",
  "Next": "Tiếp",
  "Details": "Chi tiết",
  "Set as target": "Chọn làm tâm điểm",
  "Analyze impact →": "Phân tích tác động →",

  // Impact Analysis / Blast Radius
  "Target element to analyze": "Chọn phần tử mục tiêu cần phân tích (Giả lập sập/thay đổi)",
  "Analysis scope": "Phạm vi phân tích tác động",
  "Full Architecture (Source + Messaging + Deployment)": "Toàn bộ Kiến trúc (Code + Messaging + Docker Compose)",
  "Application & Data Only (Excludes Compose)": "Tầng Ứng dụng & Dữ liệu (Không tính Docker Compose)",
  "Component Granularity (Include Internal Components)": "Mức chi tiết Component / Class nội bộ",
  "Strict Confirmed HTTP Policy (Worker Only)": "Chỉ các kết nối HTTP đã xác nhận (Strict Worker)",
  "Outage Blast Radius Map": "Bản đồ Bán kính Ảnh hưởng Khi Sự cố (Outage Blast Radius)",
  "🔴 Unavailable": "🔴 Bị sập / Ngừng hoạt động",
  "🟠 Direct impact (1 hop)": "🟠 Ảnh hưởng trực tiếp (1 chặng)",
  "🟡 Indirect impact (2+ hops)": "🟡 Ảnh hưởng dây chuyền (2+ chặng)",
  "🔵 Downstream dependencies": "🔵 Phụ thuộc hạ nguồn (DB / Queue / Service được gọi)",
  "Direct impact (1 hop)": "Ảnh hưởng trực tiếp (1 chặng)",
  "Indirect impact (2+ hops)": "Ảnh hưởng gián tiếp (2+ chặng)",
  "Downstream dependencies": "Phụ thuộc hạ nguồn",
  "Total blast radius": "Tổng bán kính ảnh hưởng",
  "Simulated Outage Target": "Tâm điểm giả lập sự cố",
  "No indirect service impact identified": "Không có service nào bị ảnh hưởng gián tiếp (2+ chặng)",
  "No directly dependent services identified": "Không có service nào phụ thuộc trực tiếp (1 chặng)",
  "No downstream dependencies identified": "Không có phụ thuộc hạ nguồn nào",

  // Runtime Verification
  "Step 1: Configure Sandbox": "Bước 1: Cấu hình Sandbox",
  "Set resource limits and discover services": "Thiết lập tài nguyên & nhận diện service từ Compose",
  "Step 2: Test Scenarios": "Bước 2: Kịch bản Kiểm thử",
  "Define API request steps": "Định nghĩa các bước gọi HTTP API",
  "Step 3: Run & Trace": "Bước 3: Chạy & Truy vết (Trace)",
  "Monitor execution and sequence diagrams": "Theo dõi quá trình chạy & sơ đồ tuần tự thực tế",
  "1. Source Snapshot & Compose Preflight Check": "1. Chọn Bản chụp & Kiểm tra điều kiện Docker Compose (Preflight)",
  "2. Service-to-Model Mapping & Protected Secret References": "2. Ánh xạ Container sang Mô hình & Biến môi trường bảo mật",
  "3. Execution Profile & Save Configuration": "3. Cấu hình Môi trường Thực thi & Lưu",
  "Check runtime eligibility (Compose Preflight)": "Kiểm tra tính tương thích Docker Compose (Preflight)",
  "Validating Compose...": "Đang kiểm tra Docker Compose...",
  "Save Runtime Configuration": "Lưu cấu hình Runtime",
  "Saving...": "Đang lưu...",
  "✓ Runtime configuration saved successfully!": "✓ Đã lưu cấu hình Runtime thành công!",
  "Create & Approve Runtime Scenario Session": "Tạo & Phê duyệt Phiên chạy Kịch bản Runtime",
  "Scenario Name": "Tên kịch bản kiểm thử",
  "HTTP Scenario Steps": "Các bước gửi request HTTP",
  "⚡ Fill Sample Steps": "⚡ Điền nhanh kịch bản mẫu",
  "+ Add Step": "+ Thêm bước",
  "🚀 Create & Approve Run": "🚀 Tạo & Chạy kiểm thử ngay",
  "Save As Pending Session": "Lưu thành phiên chờ duyệt",
  "Saved Scenarios": "Các kịch bản đã lưu",
  "Runtime Verification & Execution": "Xác thực Runtime & Thực thi Kịch bản",
  "1-Click Run Verification": "⚡ Chạy xác thực nhanh (1-Click Run)",
  "Configure Advanced Steps": "Cấu hình kịch bản nâng cao",
  "Execution Sessions": "Danh sách Phiên chạy (Sessions)",
};

const PATTERN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^Revision (\d+)$/i, "Phiên bản $1"],
  [/^→ Revision (\d+)$/i, "→ Phiên bản $1"],
  [/^Snapshot #(\d+)$/i, "Bản chụp #$1"],
  [/^Snapshots \((\d+)\)$/i, "Bản chụp ($1)"],
  [/^History \((\d+)\)$/i, "Lịch sử ($1)"],
  [/^Connection evidence for (.+) \((\d+) peer\(s\)\)$/i, "Bằng chứng kết nối của $1 ($2 đối tác)"],
  [/^Source evidence for both sides \((.+)\):$/i, "Bằng chứng mã nguồn ở cả 2 đầu ($1):"],
  [/^Class \/ Component in (.+):$/i, "Class / Component trong $1:"],
  [/^Source evidence in (.+):$/i, "Đoạn code bằng chứng trong $1:"],
  [/^(\d+) code reference\(s\)$/i, "$1 vị trí trong code"],
  [/^(\d+) relationship\(s\)$/i, "$1 mối quan hệ"],
  [/^Impacted if (.+) changes \((\d+)\)$/i, "Các phần tử bị ảnh hưởng nếu $1 gặp sự cố / thay đổi ($2)"],
  [/^Downstream dependencies of (.+) \((\d+)\)$/i, "Các phần tử hạ nguồn mà $1 phụ thuộc vào ($2)"],
  [/^Direct · 1 hop$/i, "Trực tiếp · 1 chặng"],
  [/^Indirect · (\d+) hops$/i, "Gián tiếp · $1 chặng"],
  [/^Transitive · (\d+) hops$/i, "Bắc cầu · $1 chặng"],
  [/^(\d+) elements within the potential blast radius$/i, "$1 phần tử nằm trong bán kính ảnh hưởng"],
  [/^(\d+) saved · (\d+) previews?$/i, "$1 đã lưu · $2 xem trước"],
  [/^Model revision (\d+)$/i, "Mô hình phiên bản $1"],
];

export function translateStringToVi(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const exact = EXACT_VI_DICTIONARY[trimmed];
  if (exact) {
    return raw.replace(trimmed, exact);
  }
  for (const [regex, replacement] of PATTERN_REPLACEMENTS) {
    if (regex.test(trimmed)) {
      return raw.replace(trimmed, trimmed.replace(regex, replacement));
    }
  }
  return raw;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  toggleLocale: () => {},
  t: (en) => en,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "vi" || saved === "en") {
        setLocaleState(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    } catch {
      // ignore
    }
  };

  const toggleLocale = () => setLocale(locale === "en" ? "vi" : "en");

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t: (enText: string, viText?: string) => {
        if (locale === "en") return enText;
        return viText ?? translateStringToVi(enText);
      },
    }),
    [locale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <AutoDomTranslator locale={locale} />
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

const originalTextMap = new WeakMap<Text, string>();
const originalAttrMap = new WeakMap<Element, Record<string, string>>();

function shouldSkipElement(el: Element | null): boolean {
  if (!el) return true;
  const tag = el.tagName;
  if (
    tag === "CODE" ||
    tag === "PRE" ||
    tag === "SCRIPT" ||
    tag === "STYLE" ||
    tag === "TEXTAREA" ||
    tag === "SVG" ||
    tag === "PATH"
  ) {
    return true;
  }
  if (el.closest("code, pre, [data-no-translate], .font-mono")) {
    return true;
  }
  return false;
}

function applyDomTranslation(root: Node, locale: Locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  while (current) {
    const parent = current.parentElement;
    if (!shouldSkipElement(parent)) {
      const currentVal = current.nodeValue ?? "";
      if (locale === "vi") {
        const orig = originalTextMap.get(current) ?? currentVal;
        const translated = translateStringToVi(orig);
        if (translated !== orig && currentVal !== translated) {
          originalTextMap.set(current, orig);
          current.nodeValue = translated;
        }
      } else {
        const orig = originalTextMap.get(current);
        if (orig !== undefined && currentVal !== orig) {
          current.nodeValue = orig;
        }
      }
    }
    current = walker.nextNode() as Text | null;
  }

  if (root instanceof Element || root instanceof Document) {
    const elements = (root instanceof Document ? root.body : root)?.querySelectorAll(
      "[placeholder], [title]",
    );
    elements?.forEach((el) => {
      if (shouldSkipElement(el)) return;
      const saved = originalAttrMap.get(el) ?? {};
      for (const attr of ["placeholder", "title"] as const) {
        const val = el.getAttribute(attr);
        if (!val) continue;
        if (locale === "vi") {
          const orig = saved[attr] ?? val;
          const translated = translateStringToVi(orig);
          if (translated !== orig && val !== translated) {
            saved[attr] = orig;
            originalAttrMap.set(el, saved);
            el.setAttribute(attr, translated);
          }
        } else if (saved[attr] !== undefined && val !== saved[attr]) {
          el.setAttribute(attr, saved[attr]);
        }
      }
    });
  }
}

function AutoDomTranslator({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;
    applyDomTranslation(document.body, locale);
    if (locale !== "vi") return;

    let rafId = 0;
    const observer = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (document.body) applyDomTranslation(document.body, "vi");
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [locale]);

  return null;
}

export function LocaleSwitchButton() {
  const { locale, toggleLocale } = useLocale();
  return (
    <button
      type="button"
      data-no-translate
      onClick={toggleLocale}
      title={locale === "vi" ? "Chuyển sang Tiếng Anh (Switch to English)" : "Chuyển sang Tiếng Việt (Switch to Vietnamese)"}
      aria-label="Toggle language between English and Vietnamese"
      className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5 text-xs font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={`rounded-full px-2 py-1 transition ${
          locale === "en"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </span>
      <span
        className={`rounded-full px-2 py-1 transition ${
          locale === "vi"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        VI
      </span>
    </button>
  );
}
