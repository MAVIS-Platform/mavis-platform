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
  "+ Add Step": "+ Thêm bước",
  "- Docker / Infrastructure & Connectivity:": "- Docker / Hạ tầng & Kết nối mạng:",
  "1-Click Run Verification": "⚡ Chạy xác thực nhanh (1-Click Run)",
  "1. Source Snapshot & Compose Preflight Check": "1. Chọn Bản chụp & Kiểm tra điều kiện Docker Compose (Preflight)",
  "2. Service-to-Model Mapping & Protected Secret References": "2. Ánh xạ Container sang Mô hình & Biến môi trường bảo mật",
  "3. Execution Profile & Save Configuration": "3. Cấu hình Môi trường Thực thi & Lưu",
  "AI Explanation": "Giải thích AI (3E)",
  "AI Explanations": "Giải thích AI (3E)",
  "AI explanation": "Giải thích AI (3E)",
  "AI is responding…": "AI đang trả lời…",
  "Account status": "Trạng thái tài khoản",
  "Accounts": "Danh sách tài khoản",
  "Action": "Thao tác",
  "Actions": "Thao tác",
  "Active": "Đang hoạt động",
  "Activity perspective": "Góc nhìn sơ đồ hoạt động (UML Activity)",
  "Add": "Thêm",
  "Add member": "Thêm thành viên",
  "Add students": "Thêm sinh viên",
  "Add students in bulk": "Thêm danh sách sinh viên hàng loạt",
  "Admin": "Quản trị hệ thống",
  "Administration": "Quản trị hệ thống",
  "All Projects": "Tất cả dự án",
  "All relationships": "Tất cả mối quan hệ",
  "Analysis History": "Lịch sử phân tích",
  "Analysis jobs": "Tiến trình phân tích",
  "Analysis scope": "Phạm vi phân tích tác động",
  "Analysis status": "Trạng thái phân tích",
  "Analyze Snapshot": "Phân tích bản chụp",
  "Analyze Source": "Phân tích mã nguồn",
  "Analyze Source Snapshot": "Phân tích bản chụp mã nguồn",
  "Analyze impact →": "Phân tích tác động →",
  "Analyzed": "Đã phân tích",
  "Analyzing...": "Đang phân tích...",
  "Analyzing…": "Đang phân tích…",
  "Appearance": "Giao diện hiển thị",
  "Application & Data Only (Excludes Compose)": "Tầng Ứng dụng & Dữ liệu (Không tính Docker Compose)",
  "Apply": "Áp dụng",
  "Approved": "Đã phê duyệt",
  "Architecture": "Kiến trúc",
  "Architecture Atlas": "Bản đồ Kiến trúc (Architecture Atlas)",
  "Architecture Diagrams": "Sơ đồ Kiến trúc (C4/UML)",
  "Architecture Evaluation": "Đánh giá Kiến trúc",
  "Architecture Graph": "Đồ thị kiến trúc",
  "Architecture Graph Explorer": "Khám phá Đồ thị Kiến trúc",
  "Architecture Inspector · 3E": "Trình kiểm tra Kiến trúc · 3E",
  "Architecture Model Editor": "Trình chỉnh sửa Mô hình Kiến trúc",
  "Architecture documents": "Tài liệu kiến trúc",
  "Architecture evaluation": "Đánh giá kiến trúc",
  "Architecture layer": "Tầng kiến trúc",
  "Architecture revision": "Phiên bản kiến trúc",
  "Architecture revisions": "Phiên bản kiến trúc",
  "Architecture view": "Góc nhìn kiến trúc",
  "Archive workspace": "Lưu trữ không gian làm việc",
  "Ask AI": "Hỏi AI",
  "Ask a follow-up": "Hỏi thêm AI về phần tử này",
  "Ask about this selection": "Đặt câu hỏi trong phạm vi phần tử đang chọn",
  "Assess what is supported": "Đánh giá kiến trúc & Rủi ro",
  "Assignment GitHub repository URL": "Đường dẫn kho GitHub bài tập",
  "Assignment commit SHA": "Mã commit SHA bài tập",
  "Assignment instructions": "Hướng dẫn làm bài",
  "Assignment project & source version": "Dự án & phiên bản mã nguồn bài tập",
  "Assignment project ZIP": "File ZIP dự án bài tập",
  "Assignment title": "Tiêu đề bài tập",
  "Assignments": "Bài tập lớn",
  "Assumptions & unknowns": "Giả định & Điểm chưa xác minh",
  "Audit": "Kiểm toán & Nhật ký",
  "Audit Logs": "Nhật ký hệ thống",
  "Audit Records": "Hồ sơ kiểm toán & Nhật ký",
  "Auto-detected scenario": "Kịch bản tự động nhận diện",
  "Available": "Khả dụng",
  "Awaiting lecturer review. Inline feedback may be available below.": "Đang chờ giảng viên chấm bài. Nhận xét chi tiết sẽ hiển thị bên dưới.",
  "Back": "Quay lại",
  "Back to sign in": "Quay lại trang đăng nhập",
  "Backend JVM memory": "Bộ nhớ JVM Backend",
  "Backend uptime": "Thời gian hoạt động Backend",
  "Both directions": "Cả hai chiều",
  "Branch": "Nhánh",
  "Branch / Commit": "Nhánh / Commit",
  "Branch / commit": "Nhánh / Commit",
  "CPU cores": "Số nhân CPU",
  "Cached": "Đã lưu cache",
  "Cancel": "Hủy",
  "Cancelled": "Đã hủy",
  "Change Impact Analysis": "Phân tích Tác động Thay đổi & Sự cố",
  "Change Password": "Đổi mật khẩu",
  "Change impact": "Tác động thay đổi",
  "Channel": "Kênh liên lạc",
  "Check runtime eligibility (Compose Preflight)": "Kiểm tra tính tương thích Docker Compose (Preflight)",
  "Check your connection and try again.": "Vui lòng kiểm tra kết nối mạng và thử lại.",
  "Choose": "Lựa chọn",
  "Choose a model": "Chọn một mô hình",
  "Choose a project from this class to prepare your submission.": "Chọn một dự án từ lớp học này để chuẩn bị nộp bài.",
  "Choose a relationship": "Chọn một mối quan hệ",
  "Choose a service to calculate impact.": "Chọn một service để tính toán bán kính ảnh hưởng.",
  "Choose a workspace": "Chọn một không gian làm việc",
  "Choose an element to inspect": "Chọn một phần tử để kiểm tra",
  "Choose one member relationship": "Chọn một mối quan hệ thành phần",
  "Choose sample role": "Chọn vai trò mẫu",
  "Class assignments": "Bài tập của lớp",
  "Class code": "Mã lớp học",
  "Class description": "Mô tả lớp học",
  "Class name": "Tên lớp học",
  "Class role": "Vai trò trong lớp",
  "Class settings": "Cài đặt lớp học",
  "Clear": "Xóa sạch",
  "Clear chat": "Xóa hội thoại",
  "Clear search": "Xóa tìm kiếm",
  "Clear selection": "Bỏ chọn",
  "Close": "Đóng",
  "Close 3E": "Đóng trình 3E",
  "Close connection details": "Đóng chi tiết kết nối",
  "Close inspector": "Đóng bảng kiểm tra",
  "Collapse": "Thu gọn",
  "Collapse service internals": "Thu gọn thành phần bên trong Service",
  "Compare": "So sánh",
  "Compare Model Versions": "So sánh Phiên bản Mô hình",
  "Compare Revisions": "So sánh Phiên bản",
  "Compare revisions →": "So sánh các phiên bản →",
  "Completed": "Đã hoàn tất",
  "Completed runs": "Phân tích thành công",
  "Component": "Component",
  "Component Granularity (Include Internal Components)": "Mức chi tiết Component / Class nội bộ",
  "Component shape": "Hình dạng Component",
  "Configure Advanced Steps": "Cấu hình kịch bản nâng cao",
  "Confirm": "Xác nhận",
  "Confirm Password": "Xác nhận mật khẩu",
  "Confirm password": "Xác nhận mật khẩu",
  "Connected service": "Service kết nối - Đối tác",
  "Connection details": "Chi tiết kết nối",
  "Connection direction": "Chiều kết nối",
  "Connection to explore": "Kết nối cần khám phá",
  "Connection to remove": "Kết nối cần gỡ bỏ",
  "Connection type": "Loại kết nối",
  "Connections": "Kết nối",
  "Connections in selected group": "Các kết nối trong nhóm đã chọn",
  "Context incomplete · external callers require review": "Ngữ cảnh chưa hoàn chỉnh · cần kiểm tra các bên gọi ngoài",
  "Contextual detail panel": "Bảng chi tiết ngữ cảnh",
  "Contextual evidence": "Bằng chứng theo ngữ cảnh",
  "Contextual navigation": "Điều hướng theo ngữ cảnh",
  "Contract & resolution details": "Chi tiết hợp đồng giao tiếp (Feign / HTTP Contract)",
  "Copied": "Đã sao chép",
  "Copy": "Sao chép",
  "Coursework submissions": "Danh sách bài tập nộp",
  "Coverage and review status": "Trạng thái bao phủ và đánh giá",
  "Covered lifelines:": "Các đường sinh tồn (Lifelines) được bao phủ:",
  "Create": "Tạo mới",
  "Create & Approve Runtime Scenario Session": "Tạo & Phê duyệt Phiên chạy Kịch bản Runtime",
  "Create a teaching workspace": "Tạo không gian làm việc giảng dạy",
  "Create coursework project": "Tạo dự án bài tập nộp",
  "Create designed copy": "Tạo bản sao thiết kế",
  "Create reference project": "Tạo dự án tham chiếu",
  "Create workspace": "Tạo không gian làm việc mới",
  "Created": "Thời gian tạo",
  "Created At": "Thời gian tạo",
  "Current Password": "Mật khẩu hiện tại",
  "Cylinder": "Hình trụ",
  "Dark": "Tối",
  "Dashed (Deployment / Declared)": "Nét đứt (Triển khai / Khai báo)",
  "Data store": "Cơ sở dữ liệu",
  "Database": "Cơ sở dữ liệu",
  "Datastore": "Kho dữ liệu",
  "Deadline (optional)": "Hạn nộp (tùy chọn)",
  "Declaration location recorded:": "Vị trí khai báo đã ghi nhận:",
  "Declared dependencies · not a Sequence": "Phụ thuộc đã khai báo · không phải Sơ đồ tuần tự",
  "Define API request steps": "Định nghĩa các bước gọi HTTP API",
  "Defined in:": "Được định nghĩa tại:",
  "Delete": "Xóa",
  "Delete assignment": "Xóa bài tập",
  "Dependency kind": "Loại phụ thuộc",
  "Deployment dependencies": "Phụ thuộc triển khai (Docker Compose)",
  "Description": "Mô tả",
  "Design foundation": "Nền tảng thiết kế",
  "Design preview · All content is illustrative. No live system data.": "Bản xem trước thiết kế · Dữ liệu minh họa.",
  "Details": "Chi tiết",
  "Diagnostic summary": "Tóm tắt chẩn đoán",
  "Diagram": "Sơ đồ",
  "Diagram type": "Loại sơ đồ",
  "Diagram zoom": "Thu phóng sơ đồ",
  "Diagrams": "Sơ đồ C4 & UML",
  "Direct callers:": "Các bên gọi trực tiếp:",
  "Direct dependencies:": "Các phụ thuộc trực tiếp:",
  "Direct impact (1 hop)": "Ảnh hưởng trực tiếp (1 chặng)",
  "Direction": "Chiều kết nối",
  "Direction:": "Chiều kết nối:",
  "Disabled": "Đã tắt",
  "Discover microservices": "Khám phá các microservice",
  "Discovered components": "Component đã nhận diện",
  "Discovered services": "Service đã nhận diện",
  "Displays the mobile sidebar.": "Mở thanh điều hướng di động.",
  "Document title": "Tiêu đề tài liệu",
  "Done": "Xong",
  "Download": "Tải xuống",
  "Download assigned source ZIP": "Tải file ZIP mã nguồn bài tập",
  "Download diagram JSON": "Tải file sơ đồ JSON",
  "Download submitted draw.io": "Tải file sơ đồ draw.io đã nộp",
  "Downstream dependencies": "Phụ thuộc hạ nguồn",
  "Draft": "Bản nháp",
  "Duplicate": "Nhân bản",
  "Duration": "Thời lượng",
  "Edge properties": "Thuộc tính cạnh nối",
  "Edit": "Chỉnh sửa",
  "Education": "Giáo dục",
  "Element Role": "Vai trò phần tử",
  "Element kind": "Loại phần tử",
  "Element name": "Tên phần tử",
  "Elements": "Phần tử",
  "Email": "Email",
  "Email address": "Địa chỉ Email",
  "Enabled": "Đã bật",
  "Enter a score between 0 and 100 with at most two decimal places.": "Nhập điểm từ 0 đến 100, tối đa hai chữ số thập phân.",
  "Enter your current password and choose a new one.": "Nhập mật khẩu hiện tại và chọn mật khẩu mới.",
  "Evaluate": "Đánh giá (Evaluate)",
  "Evaluation": "Đánh giá quy tắc",
  "Evidence": "Bằng chứng (Evidence)",
  "Evidence kind": "Loại bằng chứng",
  "Evidence language": "Ngôn ngữ bằng chứng",
  "Evidence sufficiency": "Mức độ đầy đủ của bằng chứng",
  "Evidence:": "Bằng chứng:",
  "Execution Profile ID": "Mã cấu hình thực thi (Profile ID)",
  "Execution Sessions": "Danh sách Phiên chạy (Sessions)",
  "Execution status": "Trạng thái thực thi",
  "Exit fullscreen (Esc)": "Thoát toàn màn hình (Esc)",
  "Expand": "Mở rộng",
  "Expand service internals": "Mở rộng thành phần bên trong Service",
  "Explain": "Giải thích (Explain)",
  "Explain selection": "Giải thích phần tử đã chọn",
  "Explain this selection": "Giải thích phần tử đang chọn",
  "Explanations with context.": "Giải thích kiến trúc kèm ngữ cảnh mã nguồn.",
  "Export": "Xuất file",
  "Export Draw.io XML": "Xuất file XML Draw.io",
  "Export PNG image": "Xuất file ảnh PNG",
  "Export SVG vector": "Xuất file vector SVG",
  "Export diagram": "Xuất sơ đồ",
  "Export format": "Định dạng xuất",
  "Export frozen submission bundle": "Xuất gói bài nộp đóng băng (Bundle)",
  "External System": "Hệ thống ngoài",
  "Failed": "Thất bại",
  "Failed runs": "Phân tích thất bại",
  "Feedback": "Nhận xét",
  "Feedback on this submission version": "Nhận xét cho phiên bản bài nộp này",
  "File & Line:": "File & Dòng:",
  "Filter": "Bộ lọc",
  "Filter members": "Lọc thành viên",
  "Filters": "Bộ lọc",
  "Find a relationship": "Tìm kiếm mối quan hệ",
  "Finish": "Hoàn thành",
  "Fit": "Căn vừa",
  "Fit graph": "Căn vừa khung hình",
  "Fit graph — show the entire graph": "Căn vừa khung hình — hiển thị toàn bộ đồ thị",
  "Found in source code:": "Tìm thấy trong mã nguồn:",
  "Full 40-character SHA": "Mã SHA đầy đủ 40 ký tự",
  "Full Architecture (Source + Messaging + Deployment)": "Toàn bộ Kiến trúc (Code + Messaging + Docker Compose)",
  "Full Name": "Họ và tên",
  "Full name": "Họ và tên",
  "Fullscreen": "Toàn màn hình",
  "Fullscreen — expand the workspace": "Toàn màn hình — mở rộng không gian làm việc",
  "General": "Chung",
  "Generated revisions": "Phiên bản được tạo",
  "GitHub repository": "Kho lưu trữ GitHub",
  "GitHub repository URL": "Đường dẫn kho lưu trữ GitHub",
  "Global navigation": "Điều hướng toàn cục",
  "Go home": "Về trang chủ",
  "Go to next page": "Sang trang tiếp theo",
  "Go to previous page": "Về trang trước",
  "Graph Explorer": "Đồ thị Kiến trúc",
  "Graph controls": "Bộ lọc đồ thị",
  "Graph elements (keyboard navigation)": "Danh sách phần tử đồ thị (điều hướng bàn phím)",
  "Graph guide": "Hướng dẫn sử dụng đồ thị",
  "Graph options": "Tùy chọn hiển thị đồ thị",
  "Grounded explanation": "Giải thích có căn cứ mã nguồn",
  "HTTP Scenario Steps": "Các bước gửi request HTTP",
  "Hide advanced options": "Ẩn tùy chọn nâng cao",
  "History": "Lịch sử",
  "Impact Analysis": "Phân tích tác động",
  "Import": "Nhập dữ liệu",
  "Import & analyze source": "Nhập & phân tích mã nguồn",
  "Import Snapshot": "Nhập mã nguồn mới",
  "Import Source": "Nhập mã nguồn",
  "In progress": "Đang xử lý",
  "Inactive": "Ngừng hoạt động",
  "Inbound connections": "Kết nối gọi đến",
  "Indirect impact (2+ hops)": "Ảnh hưởng gián tiếp (2+ chặng)",
  "Input tokens": "Token đầu vào (Prompt)",
  "Inspect": "Kiểm tra",
  "Inspect a connection": "Kiểm tra kết nối & Bằng chứng",
  "Inspect evidence & 3E": "Xem bằng chứng & Phân tích 3E",
  "Inspect relationship evidence": "Xem bằng chứng của mối quan hệ này",
  "Inspect source evidence": "Xem bằng chứng mã nguồn chi tiết",
  "Inspect the caller, receiver and configuration snippets attached to this selection.": "Kiểm tra đoạn code bên gọi (caller), bên nhận (receiver) và file cấu hình của phần tử đang chọn.",
  "Inspect:": "Kiểm tra:",
  "Instructions": "Hướng dẫn",
  "Integration Management": "Quản lý tích hợp",
  "Integrations": "Tích hợp hệ thống",
  "Internal": "Nội bộ",
  "Job status": "Trạng thái tiến trình",
  "Just imported": "Vừa nhập",
  "Keep this dialog open": "Giữ hộp thoại này mở",
  "Keyboard": "Phím tắt bàn phím",
  "Keyboard shortcuts": "Phím tắt bàn phím",
  "Language": "Ngôn ngữ",
  "Latest": "Mới nhất",
  "Latest 50 analysis jobs · refresh every 30 seconds": "50 tiến trình phân tích gần nhất · tự động làm mới mỗi 30 giây",
  "Layer": "Tầng kiến trúc",
  "Lecturer": "Giảng viên",
  "Lecturer review & grade": "Giảng viên đánh giá & Chấm điểm",
  "Lecturer score (out of 100)": "Điểm giảng viên (thang điểm 100)",
  "Light": "Sáng",
  "Line style": "Kiểu đường nối",
  "Live checks · refresh every 30 seconds": "Kiểm tra trực tiếp · tự động cập nhật mỗi 30 giây",
  "Load observed sequence": "Tải sơ đồ tuần tự thực tế (Trace)",
  "Loading saved evidence…": "Đang tải bằng chứng mã nguồn…",
  "Loading...": "Đang tải...",
  "Loading…": "Đang tải…",
  "Locked": "Đã khóa",
  "Log out": "Đăng xuất",
  "Manage": "Quản lý",
  "Manage access and teaching roles": "Quản lý quyền truy cập và vai trò giảng dạy",
  "Manage access and teaching roles. Click Save at the end of a row to apply changes.": "Quản lý quyền truy cập và vai trò giảng dạy. Bấm Lưu ở cuối dòng để áp dụng.",
  "Manage integrations": "Quản lý tích hợp hệ thống",
  "Manage teaching references": "Quản lý dự án mẫu & Tài liệu giảng dạy",
  "Manage your account": "Quản lý tài khoản của bạn",
  "Manage your account information and password.": "Quản lý thông tin tài khoản và mật khẩu của bạn.",
  "Mark all as read": "Đánh dấu tất cả đã đọc",
  "Mark as read": "Đánh dấu đã đọc",
  "Matched rules": "Quy tắc kiến trúc phù hợp",
  "Members": "Thành viên",
  "Messaging": "Hàng đợi / Messaging",
  "Method": "Phương thức",
  "Metrics": "Chỉ số",
  "Model": "Mô hình",
  "Model Editor": "Chỉnh sửa Mô hình",
  "Model context only": "Chỉ có thông tin mô hình",
  "Monitor execution and sequence diagrams": "Theo dõi quá trình chạy & sơ đồ tuần tự thực tế",
  "Monitoring": "Giám sát",
  "More": "Thêm nữa",
  "Move & zoom": "Di chuyển & Phóng to/Thu nhỏ",
  "My Profile": "Hồ sơ của tôi",
  "My Projects": "Dự án của tôi",
  "My Submissions": "Bài nộp của tôi",
  "My Workspaces": "Không gian làm việc của tôi",
  "Name": "Tên",
  "New Password": "Mật khẩu mới",
  "Next": "Tiếp tục",
  "Next:": "Tiếp theo:",
  "No architecture model has been generated for this project yet. Run snapshot analysis to extract architecture models, components, and diagrams.": "Chưa có mô hình kiến trúc nào được tạo cho dự án này. Hãy chạy phân tích bản chụp mã nguồn để trích xuất kiến trúc, thành phần và sơ đồ.",
  "No architecture revisions yet.": "Chưa có phiên bản kiến trúc nào.",
  "No data available": "Không có dữ liệu",
  "No dependency paths": "Không có đường dẫn phụ thuộc",
  "No direct Docker Compose declaration is available; this connection is recorded at code or API level.": "Không có khai báo trực tiếp trong Docker Compose; kết nối này được ghi nhận ở tầng Code hoặc API.",
  "No directly dependent services identified": "Không có service nào phụ thuộc trực tiếp (1 chặng)",
  "No downstream dependencies identified": "Không có phụ thuộc hạ nguồn nào",
  "No elements available for this filter.": "Không có phần tử nào khớp với bộ lọc hiện tại.",
  "No elements match.": "Không có phần tử nào phù hợp.",
  "No feedback saved for this submission.": "Chưa có nhận xét nào được lưu cho bài nộp này.",
  "No indirect service impact identified": "Không có service nào bị ảnh hưởng gián tiếp (2+ chặng)",
  "No items selected": "Chưa chọn mục nào",
  "No matching items found": "Không tìm thấy mục nào phù hợp",
  "No model published": "Chưa có mô hình",
  "No notifications": "Không có thông báo mới",
  "No records found": "Không tìm thấy bản ghi nào",
  "No source file or snippet is recorded for this reference.": "Chưa có file hoặc đoạn code nào được ghi nhận cho tham chiếu này.",
  "No source snapshots imported yet.": "Chưa nhập bản chụp mã nguồn nào.",
  "No trace available": "Chưa có dữ liệu Trace",
  "Not Started": "Chưa bắt đầu",
  "Not available": "Không khả dụng",
  "Notices": "Thông báo chú ý",
  "Notifications": "Thông báo",
  "Notifications could not be loaded. Your other work is unaffected.": "Không thể tải thông báo. Các công việc khác của bạn không bị ảnh hưởng.",
  "One plain line per pair · select for direction, source & evidence": "Mỗi cặp hiển thị 1 đường nối gộp · Bấm vào đường nối hoặc node để xem chiều gọi, mã nguồn & bằng chứng",
  "One registered email per line": "Mỗi dòng một địa chỉ email đã đăng ký",
  "Open": "Mở",
  "Open Diagrams": "Mở Sơ đồ",
  "Open Graph": "Mở Đồ thị",
  "Open in new tab": "Mở trong tab mới",
  "Open project overview": "Mở tổng quan dự án",
  "Open →": "Mở →",
  "Opening Graph…": "Đang mở đồ thị…",
  "Optional +": "Tùy chọn +",
  "Origin": "Nguồn gốc",
  "Origin:": "Nguồn gốc:",
  "Outage Blast Radius Map": "Bản đồ Bán kính Ảnh hưởng Khi Sự cố (Outage Blast Radius)",
  "Outbound connections": "Kết nối gọi đi",
  "Output revision": "Phiên bản đầu ra",
  "Output tokens": "Token đầu ra (Completion)",
  "Overview": "Tổng quan",
  "Overview:": "Tổng quan:",
  "Owner": "Chủ sở hữu",
  "Page not found": "Không tìm thấy trang yêu cầu",
  "Password": "Mật khẩu",
  "Passwords do not match.": "Mật khẩu xác nhận không khớp.",
  "Pending": "Đang chờ xử lý",
  "Personal": "Cá nhân",
  "Planned": "Đã lên kế hoạch",
  "Platform Usage": "Thống kê sử dụng nền tảng",
  "Please select a valid option": "Vui lòng chọn một tùy chọn hợp lệ",
  "Please wait...": "Vui lòng đợi...",
  "Please wait…": "Vui lòng đợi…",
  "Potential failure propagation if": "Khả năng lan truyền sự cố nếu",
  "Prepare coursework submission": "Chuẩn bị bài nộp môn học",
  "Preview": "Bản xem trước",
  "Previous": "Trước",
  "Processing...": "Đang xử lý...",
  "Processing…": "Đang xử lý…",
  "Profile": "Hồ sơ cá nhân",
  "Profile information": "Thông tin hồ sơ cá nhân",
  "Profile:": "Hồ sơ:",
  "Project": "Dự án",
  "Project Not Analyzed Yet": "Dự án chưa được phân tích",
  "Project ZIP (up to 100 MB)": "File ZIP dự án (tối đa 100 MB)",
  "Projects": "Dự án",
  "Protocol": "Giao thức",
  "Publish": "Xuất bản",
  "Publish grade": "Công bố điểm số",
  "Publish reference snapshot": "Xuất bản bản chụp tham chiếu",
  "Published assignments": "Bài tập đã giao",
  "Published revisions": "Phiên bản đã xuất bản",
  "Re-run analysis": "Phân tích lại",
  "Read-only · latest 100 audit records": "Chỉ đọc · 100 bản ghi kiểm toán gần nhất",
  "Ready": "Sẵn sàng",
  "Ready projects": "Dự án sẵn sàng",
  "Recent activity": "Hoạt động gần đây",
  "Recent activity across your projects": "Hoạt động gần đây trong các dự án của bạn",
  "Recent projects": "Dự án gần đây",
  "Record": "Bản ghi",
  "Reference project": "Dự án tham chiếu",
  "Reference project name": "Tên dự án tham chiếu",
  "Refresh": "Làm mới",
  "Rejected": "Bị từ chối",
  "Relationship details": "Chi tiết mối quan hệ",
  "Relationship origin": "Nguồn gốc mối quan hệ",
  "Remove": "Gỡ bỏ",
  "Rename": "Đổi tên",
  "Reopen workspace": "Mở lại không gian làm việc",
  "Require runtime trace": "Yêu cầu bằng chứng Runtime Trace",
  "Required diagram types": "Các loại sơ đồ yêu cầu",
  "Reset": "Đặt lại",
  "Results": "Kết quả",
  "Retry": "Thử lại",
  "Retry evidence": "Tải lại bằng chứng",
  "Return to dashboard": "Quay lại bảng điều khiển",
  "Return to selection": "Quay lại phần đang chọn",
  "Review": "Đánh giá & Chấm điểm",
  "Review submissions for this assignment": "Chấm và duyệt bài nộp của bài tập này",
  "Review supporting evidence": "Xem lại bằng chứng đối chiếu",
  "Revision": "Phiên bản",
  "Role": "Vai trò",
  "Running": "Đang thực thi",
  "Runtime": "Kiểm thử Runtime",
  "Runtime Administration": "Quản trị Runtime",
  "Runtime Configuration": "Cấu hình Runtime Sandbox",
  "Runtime Execution Profiles": "Hồ sơ thực thi Runtime",
  "Runtime Scenarios": "Kịch bản Runtime",
  "Runtime Sessions": "Phiên chạy Runtime & Trace",
  "Runtime Summary": "Tổng quan Runtime",
  "Runtime Verification & Execution": "Xác thực Runtime & Thực thi Kịch bản",
  "Runtime capable": "Hỗ trợ Runtime",
  "Runtime observations": "Quan sát thực thi (Runtime Trace)",
  "Save": "Lưu",
  "Save As Pending Session": "Lưu thành phiên chờ duyệt",
  "Save Runtime Configuration": "Lưu cấu hình Runtime",
  "Save changes": "Lưu thay đổi",
  "Save changes?": "Lưu thay đổi?",
  "Saved": "Đã lưu",
  "Saved Scenarios": "Các kịch bản đã lưu",
  "Saved snippets are source evidence. Metadata previews are reconstructions. Static evidence does not prove runtime execution.": "Đoạn code đã lưu là bằng chứng trực tiếp từ mã nguồn. Bản xem trước metadata là dữ liệu tái tạo từ AST.",
  "Saving...": "Đang lưu...",
  "Saving…": "Đang lưu…",
  "Scenario Name": "Tên kịch bản kiểm thử",
  "Scheduled deadlines": "Hạn nộp đã lên lịch",
  "Scope": "Phạm vi",
  "Scope:": "Phạm vi:",
  "Search": "Tìm kiếm",
  "Search graph": "Tìm kiếm trên đồ thị",
  "Search graph...": "Tìm kiếm trên đồ thị...",
  "Search service…": "Tìm kiếm service…",
  "Search...": "Tìm kiếm...",
  "Search…": "Tìm kiếm…",
  "Security": "Bảo mật",
  "Select": "Chọn",
  "Select a model version": "Chọn một phiên bản mô hình",
  "Select a pair": "Chọn một cặp phần tử",
  "Select a project": "Chọn một dự án",
  "Select a workspace": "Chọn một không gian làm việc",
  "Select an element on the graph": "Chọn một phần tử trên đồ thị",
  "Select to inspect": "Bấm để kiểm tra chi tiết",
  "Selected": "Đã chọn",
  "Selected project": "Dự án đang chọn",
  "Selected service": "Service đang chọn - Chủ thể",
  "Selected workspace": "Không gian làm việc đang chọn",
  "Selection details & relationships": "Chi tiết phần tử & Danh sách quan hệ",
  "Send": "Gửi",
  "Service": "Service",
  "Services": "Số lượng Service",
  "Services indexed": "Service đã lập chỉ mục",
  "Session": "Phiên chạy",
  "Set as target": "Chọn làm tâm điểm",
  "Set resource limits and discover services": "Thiết lập tài nguyên & nhận diện service từ Compose",
  "Settings": "Cài đặt",
  "Show advanced options": "Hiện tùy chọn nâng cao",
  "Showing": "Đang hiển thị",
  "Sidebar": "Thanh bên",
  "Sign in": "Đăng nhập",
  "Sign in options": "Tùy chọn đăng nhập",
  "Sign in required": "Yêu cầu đăng nhập",
  "Sign in to continue": "Đăng nhập để tiếp tục",
  "Sign in to view your profile.": "Đăng nhập để xem hồ sơ của bạn.",
  "Sign in with email": "Đăng nhập bằng Email",
  "Sign out": "Đăng xuất",
  "Simulated Outage Target": "Tâm điểm giả lập sự cố",
  "Snapshots": "Bản chụp (Snapshots)",
  "Solid (Static Code Dependency)": "Nét liền (Phụ thuộc mã nguồn tĩnh)",
  "Something went wrong. Please try again.": "Đã xảy ra lỗi. Vui lòng thử lại.",
  "Source": "Mã nguồn",
  "Source Snapshots": "Bản chụp mã nguồn",
  "Source and configuration": "Mã nguồn & Cấu hình (Static)",
  "Source archive": "Tệp nén mã nguồn",
  "Source context attached": "Đã đính kèm bằng chứng mã nguồn",
  "Source model:": "Mô hình nguồn:",
  "Source snapshots": "Bản chụp mã nguồn",
  "Source snapshots & analysis runs": "Bản chụp mã nguồn & Lượt phân tích",
  "Status": "Trạng thái",
  "Step 1: Configure Sandbox": "Bước 1: Cấu hình Sandbox",
  "Step 2: Test Scenarios": "Bước 2: Kịch bản Kiểm thử",
  "Step 3: Run & Trace": "Bước 3: Chạy & Truy vết (Trace)",
  "Strict Confirmed HTTP Policy (Worker Only)": "Chỉ các kết nối HTTP đã xác nhận (Strict Worker)",
  "Student": "Sinh viên",
  "Student / Individual Learner": "Sinh viên / Người học cá nhân",
  "Student email list": "Danh sách email sinh viên",
  "Students enrolled": "Số sinh viên tham gia",
  "Submissions": "Bài nộp",
  "Submit": "Nộp bài",
  "Success": "Thành công",
  "Successfully deleted!": "Đã xóa thành công!",
  "Successfully saved!": "Đã lưu thành công!",
  "Successfully updated!": "Đã cập nhật thành công!",
  "Summary": "Tóm tắt",
  "System": "Theo hệ sinh thái",
  "System Admin": "Quản trị viên",
  "System Administrator": "Quản trị viên hệ thống",
  "System Health": "Sức khỏe hệ thống",
  "Target": "Mục tiêu",
  "Target element to analyze": "Chọn phần tử mục tiêu cần phân tích (Giả lập sập/thay đổi)",
  "Target service:": "Service đích:",
  "Target:": "Mục tiêu:",
  "Theme": "Chủ đề giao diện",
  "There are no items to display.": "Không có mục nào để hiển thị.",
  "This action cannot be undone.": "Thao tác này không thể hoàn tác.",
  "Timeline": "Dòng thời gian",
  "Title": "Tiêu đề",
  "Toggle navigation": "Bật/Tắt thanh điều hướng",
  "Tokens": "Số token",
  "Topology": "Cấu trúc mạng",
  "Total analysis runs": "Tổng số lần phân tích",
  "Total blast radius": "Tổng bán kính ảnh hưởng",
  "Trace it to the source": "Truy vết tới mã nguồn (Source Evidence)",
  "Trace:": "Truy vết:",
  "Try again": "Thử lại",
  "Type": "Loại",
  "Type:": "Loại:",
  "Unavailable": "Không khả dụng",
  "Understand this selection": "Hiểu về phần tử đang chọn",
  "Unknown": "Chưa phân loại",
  "Unknown: ": "Chưa xác định: ",
  "Unread": "Chưa đọc",
  "Unsaved changes": "Thay đổi chưa lưu",
  "Unverified inference: ": "Suy luận chưa xác minh: ",
  "Update": "Cập nhật",
  "Update the password you use to sign in.": "Cập nhật mật khẩu bạn dùng để đăng nhập.",
  "Updated At": "Thời gian cập nhật",
  "Updating...": "Đang cập nhật...",
  "Updating…": "Đang cập nhật…",
  "Upload": "Tải lên",
  "Upload ZIP": "Tải lên file ZIP",
  "Uptime": "Thời gian hoạt động",
  "User Account List": "Danh sách tài khoản người dùng",
  "User Management": "Quản lý người dùng",
  "Username": "Tên đăng nhập",
  "Users & Roles": "Người dùng & Phân quyền",
  "Validating Compose...": "Đang kiểm tra Docker Compose...",
  "Verification code": "Mã xác thực",
  "Version": "Phiên bản",
  "View": "Xem",
  "View all notifications": "Xem tất cả thông báo",
  "View details": "Xem chi tiết",
  "View evidence": "Xem bằng chứng mã nguồn",
  "View findings": "Xem danh sách phát hiện",
  "View full report": "Xem toàn bộ báo cáo",
  "View history": "Xem lịch sử",
  "View log output": "Xem nhật ký tiến trình",
  "Violations found": "Vi phạm kiến trúc phát hiện được",
  "Warnings": "Cảnh báo",
  "What does this connection mean?": "Kết nối này hoạt động như thế nào?",
  "Workflow": "Quy trình",
  "Workspace": "Không gian làm việc",
  "Workspace code": "Mã không gian làm việc",
  "Workspace name": "Tên không gian làm việc",
  "Workspaces": "Lớp học / Không gian làm việc",
  "You": "Bạn",
  "Your account does not have permission to view this page.": "Tài khoản của bạn không có quyền xem trang này.",
  "Your session is unavailable or has expired. Sign in to continue.": "Phiên làm việc đã hết hạn hoặc không khả dụng. Vui lòng đăng nhập lại.",
  "ZIP upload": "Tải lên file ZIP",
  "Zoom +": "Phóng to +",
  "Zoom -": "Thu nhỏ -",
  "Zoom in": "Phóng to",
  "Zoom out": "Thu nhỏ",
  "Zoom to fit": "Căn vừa khung hình",
  "becomes unavailable": "ngừng hoạt động",
  "completed": "hoàn tất",
  "failed": "thất bại",
  "not analyzed": "chưa phân tích",
  "pending": "đang chờ",
  "running": "đang chạy",
  "⚡ Fill Sample Steps": "⚡ Điền nhanh kịch bản mẫu",
  "✓ Runtime configuration saved successfully!": "✓ Đã lưu cấu hình Runtime thành công!",
  "🔴 Unavailable": "🔴 Bị sập / Ngừng hoạt động",
  "🔵 Downstream dependencies": "🔵 Phụ thuộc hạ nguồn (DB / Queue / Service được gọi)",
  "🚀 Create & Approve Run": "🚀 Tạo & Chạy kiểm thử ngay",
  "🟠 Direct impact (1 hop)": "🟠 Ảnh hưởng trực tiếp (1 chặng)",
  "🟡 Indirect impact (2+ hops)": "🟡 Ảnh hưởng dây chuyền (2+ chặng)",
};

export const PATTERN_REPLACEMENTS: Array<[RegExp, string]> = [
  // Numbers & Versions
  [/^Revision (\d+)$/i, "Phiên bản $1"],
  [/^→ Revision (\d+)$/i, "→ Phiên bản $1"],
  [/^Snapshot #(\d+)$/i, "Bản chụp #$1"],
  [/^Snapshots \((\d+)\)$/i, "Bản chụp ($1)"],
  [/^History \((\d+)\)$/i, "Lịch sử ($1)"],
  [/^Model revision (\d+)$/i, "Mô hình phiên bản $1"],
  [/^Step (\d+) of (\d+)(?:: (.+))?$/i, "Bước $1 / $2: $3"],
  [/^Step (\d+): (.+)$/i, "Bước $1: $2"],
  [/^Page (\d+) of (\d+)$/i, "Trang $1 / $2"],
  [/^Showing (\d+) to (\d+) of (\d+) results$/i, "Hiển thị $1 đến $2 trong tổng số $3 kết quả"],
  [/^Showing (\d+) to (\d+) of (\d+)$/i, "Hiển thị $1 đến $2 trong $3"],

  // Quantities & Counts
  [/^(\d+) of (\d+) selected$/i, "Đã chọn $1 / $2"],
  [/^(\d+) selected$/i, "Đã chọn $1"],
  [/^(\d+) element\(s\)$/i, "$1 phần tử"],
  [/^(\d+) connection\(s\)$/i, "$1 kết nối"],
  [/^(\d+) relationship\(s\)$/i, "$1 mối quan hệ"],
  [/^(\d+) service\(s\)$/i, "$1 service"],
  [/^(\d+) container\(s\)$/i, "$1 container"],
  [/^(\d+) member\(s\)$/i, "$1 thành viên"],
  [/^(\d+) student\(s\)$/i, "$1 sinh viên"],
  [/^(\d+) assignment\(s\)$/i, "$1 bài tập"],
  [/^(\d+) submission\(s\)$/i, "$1 bài nộp"],
  [/^(\d+) job\(s\)$/i, "$1 tiến trình"],
  [/^(\d+) file\(s\)$/i, "$1 file"],
  [/^(\d+) item\(s\)$/i, "$1 mục"],
  [/^(\d+) finding\(s\)$/i, "$1 phát hiện quy tắc"],
  [/^(\d+) code reference\(s\)$/i, "$1 vị trí trong code"],
  [/^(\d+) saved · (\d+) preview(?:s)?$/i, "$1 đã lưu · $2 xem trước"],
  [/^(\d+) elements within the potential blast radius$/i, "$1 phần tử nằm trong bán kính ảnh hưởng"],

  // Time ago
  [/^(\d+) second(?:s)? ago$/i, "$1 giây trước"],
  [/^(\d+) minute(?:s)? ago$/i, "$1 phút trước"],
  [/^(\d+) hour(?:s)? ago$/i, "$1 giờ trước"],
  [/^(\d+) day(?:s)? ago$/i, "$1 ngày trước"],
  [/^(\d+) week(?:s)? ago$/i, "$1 tuần trước"],
  [/^(\d+) month(?:s)? ago$/i, "$1 tháng trước"],
  [/^(\d+) year(?:s)? ago$/i, "$1 năm trước"],

  // Labeled values
  [/^Created: (.+)$/i, "Thời gian tạo: $1"],
  [/^Updated: (.+)$/i, "Cập nhật lúc: $1"],
  [/^Status: (.+)$/i, "Trạng thái: $1"],
  [/^Role: (.+)$/i, "Vai trò: $1"],
  [/^Scope: (.+)$/i, "Phạm vi: $1"],
  [/^Deadline: (.+)$/i, "Hạn chót: $1"],
  [/^Branch: (.+)$/i, "Nhánh: $1"],

  // Impact & Evidence Patterns
  [/^Direct · (\d+) hops?$/i, "Trực tiếp · $1 chặng"],
  [/^Indirect · (\d+) hops?$/i, "Gián tiếp · $1 chặng"],
  [/^Transitive · (\d+) hops?$/i, "Bắc cầu · $1 chặng"],
  [/^Connection evidence for (.+) \((\d+) peer\(s\)\)$/i, "Bằng chứng kết nối của $1 ($2 đối tác)"],
  [/^Source evidence for both sides \((.+)\):$/i, "Bằng chứng mã nguồn ở cả 2 đầu ($1):"],
  [/^Class \/ Component in (.+):$/i, "Class / Component trong $1:"],
  [/^Source evidence in (.+):$/i, "Đoạn code bằng chứng trong $1:"],
  [/^Impacted if (.+) changes \((\d+)\)$/i, "Các phần tử bị ảnh hưởng nếu $1 gặp sự cố / thay đổi ($2)"],
  [/^Downstream dependencies of (.+) \((\d+)\)$/i, "Các phần tử hạ nguồn mà $1 phụ thuộc vào ($2)"],
];

export function translateStringToVi(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  // 1. Exact match
  const exact = EXACT_VI_DICTIONARY[trimmed];
  if (exact) {
    return raw.replace(trimmed, exact);
  }

  // 2. Trailing punctuation checks
  if (trimmed.endsWith(":")) {
    const base = trimmed.slice(0, -1).trim();
    if (EXACT_VI_DICTIONARY[base]) {
      return raw.replace(trimmed, EXACT_VI_DICTIONARY[base] + ":");
    }
  }

  if (trimmed.endsWith("...") || trimmed.endsWith("…")) {
    const base = trimmed.replace(/\.{3}$|…$/, "").trim();
    if (EXACT_VI_DICTIONARY[base]) {
      return raw.replace(trimmed, EXACT_VI_DICTIONARY[base] + "…");
    }
  }

  if (trimmed.endsWith("→") || trimmed.endsWith("->")) {
    const base = trimmed.replace(/→$|->$/, "").trim();
    if (EXACT_VI_DICTIONARY[base]) {
      return raw.replace(trimmed, EXACT_VI_DICTIONARY[base] + " →");
    }
  }

  if (trimmed.endsWith("?")) {
    const base = trimmed.slice(0, -1).trim();
    if (EXACT_VI_DICTIONARY[base]) {
      return raw.replace(trimmed, EXACT_VI_DICTIONARY[base] + "?");
    }
  }

  // 3. Dynamic pattern matching
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
      "[placeholder], [title], [aria-label]",
    );
    elements?.forEach((el) => {
      if (shouldSkipElement(el)) return;
      const saved = originalAttrMap.get(el) ?? {};
      for (const attr of ["placeholder", "title", "aria-label"] as const) {
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
