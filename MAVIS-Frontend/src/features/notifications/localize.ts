export type NotificationLocale = "en" | "vi";

const EXACT_TITLE_MAP: Record<string, string> = {
  "New assignment": "Bài Lab mới được giao",
  "Assignment removed": "Bài Lab đã bị gỡ",
  "Assignment updated": "Bài Lab đã được cập nhật",
  "Assignment due soon": "Bài Lab sắp đến hạn nộp",
  "Workspace access removed": "Quyền truy cập lớp học đã bị thu hồi",
  "Added to workspace": "Bạn vừa được thêm vào lớp học",
  "Workspace role changed": "Vai trò trong lớp học đã thay đổi",
  "Workspace member joined": "Thành viên mới đã tham gia lớp học",
  "Workspace status changed": "Trạng thái lớp học đã thay đổi",
  "New submission received": "Có bài nộp mới từ sinh viên",
  "Submission received": "Đã ghi nhận bài nộp của bạn",
  "Published review withdrawn": "Giảng viên đã rút lại kết quả chấm công bố",
  "Lecturer feedback removed": "Nhận xét của giảng viên đã bị xóa",
  "Submission review published": "Kết quả chấm bài Lab đã được công bố",
  "Submission graded": "Bài nộp đã được chấm điểm",
  "Submission Graded": "Bài nộp đã được chấm điểm",
  "New lecturer feedback": "Nhận xét mới từ Giảng viên",
  "Account access updated": "Quyền truy cập tài khoản đã được cập nhật",
  "Account access changed": "Quyền truy cập tài khoản vừa thay đổi",
  "Password changed": "Mật khẩu tài khoản đã được thay đổi",
  "Platform configuration changed": "Cấu hình hệ thống đã thay đổi",
  "Analysis failed": "Phân tích kiến trúc tĩnh thất bại",
  "Analysis cancelled": "Tiến trình phân tích tĩnh đã bị hủy",
  "Analysis finished": "Phân tích kiến trúc tĩnh hoàn tất",
  "Analysis job needs attention": "Tiến trình phân tích tĩnh cần kiểm tra",
  "Runtime session updated": "Phiên thực nghiệm Runtime đã cập nhật",
  "Runtime needs attention": "Phiên Runtime cần kiểm tra",
  "Reference source published": "Đã công bố mã nguồn tham chiếu mới",
  "Architecture model available": "Đã có phiên bản mô hình kiến trúc mới",
  "Evaluation available": "Đã có kết quả đánh giá kiến trúc",
  "Project status changed": "Trạng thái dự án đã thay đổi",
  "Service needs attention": "Dịch vụ hệ thống cần kiểm tra",
  "Service recovered": "Dịch vụ hệ thống đã phục hồi",
  "Next Lab unlocked": "Bài Lab tiếp theo đã được mở khóa",
  "Enrollment Confirmed": "Ghi danh lớp học thành công",
  "Enrollment confirmed": "Ghi danh lớp học thành công",
};

const EXACT_BODY_MAP: Record<string, string> = {
  "A student has submitted an assignment for review.":
    "Một sinh viên vừa nộp bài Lab và đang chờ bạn đánh giá.",
  "Your assignment submission has been saved.":
    "Bài nộp Lab của bạn đã được lưu an toàn với đầy đủ minh chứng.",
  "Your lecturer has withdrawn a published review.":
    "Giảng viên vừa rút lại kết quả chấm đã công bố để cập nhật lại.",
  "Your lecturer has updated your feedback. Open the submission to review the latest state.":
    "Giảng viên đã cập nhật phản hồi. Hãy mở chi tiết bài nộp để xem nhận xét và trạng thái mới nhất.",
  "Your account role or access status has changed. Sign in again to refresh your permissions.":
    "Vai trò hoặc trạng thái tài khoản đã thay đổi. Vui lòng đăng nhập lại để cập nhật phân quyền.",
  "An account role or status was changed. Review the administrative audit log.":
    "Vai trò hoặc trạng thái một tài khoản vừa thay đổi. Kiểm tra Nhật ký kiểm toán để rà soát.",
  "The password for your account has changed. Contact your administrator if this was not you.":
    "Mật khẩu tài khoản của bạn đã được thay đổi. Liên hệ Quản trị viên ngay nếu không phải bạn thực hiện.",
  "An integration or runtime profile was changed. Review the audit trail.":
    "Cấu hình tích hợp hoặc hồ sơ Runtime đã thay đổi. Kiểm tra Nhật ký kiểm toán để xác nhận.",
  "A source analysis job failed or timed out.":
    "Một tiến trình phân tích mã nguồn đã thất bại hoặc quá thời gian xử lý.",
  "A runtime session failed or cleanup requires review.":
    "Một phiên Runtime gặp sự cố hoặc cần kiểm tra quy trình dọn dẹp container.",
  "A reference source snapshot is available in your workspace.":
    "Một bản chụp mã nguồn tham chiếu đã được công bố trong lớp học của bạn.",
  "Architecture checks are available. Review findings and supporting evidence.":
    "Kết quả đánh giá kiến trúc đã sẵn sàng. Hãy xem các phát hiện và bằng chứng mã nguồn liên quan.",
};

const STATUS_VI_MAP: Record<string, string> = {
  COMPLETED: "Hoàn tất",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
  TIMED_OUT: "Quá thời gian",
  TERMINATED: "Đã dừng",
  REJECTED: "Bị từ chối",
  ACTIVE: "Đang hoạt động",
  ARCHIVED: "Đã lưu trữ",
  LOCKED: "Đã khóa",
  UP: "Hoạt động bình thường (UP)",
  DOWN: "Ngừng hoạt động (DOWN)",
  WARNING: "Cảnh báo (WARNING)",
  UNKNOWN: "Chưa rõ trạng thái",
  DISABLED: "Đã vô hiệu hóa",
  unknown: "chưa xác định",
};

function translateStatusToken(status: string): string {
  const trimmed = status.trim();
  return STATUS_VI_MAP[trimmed] ?? STATUS_VI_MAP[trimmed.toUpperCase()] ?? trimmed;
}

export function localizeNotificationTitle(title: string, locale: NotificationLocale): string {
  const trimmed = title.trim();
  if (!trimmed || locale === "en") return trimmed;
  if (EXACT_TITLE_MAP[trimmed]) return EXACT_TITLE_MAP[trimmed];

  const publishedCourseMatch = /^Course Published:\s*(.+)$/i.exec(trimmed);
  if (publishedCourseMatch) {
    return `Khóa học đã xuất bản: ${publishedCourseMatch[1]!.trim()}`;
  }

  const labUnlockedMatch = /^Lab\s+(.+?)\s+unlocked$/i.exec(trimmed);
  if (labUnlockedMatch) {
    return `Đã mở khóa bài Lab ${labUnlockedMatch[1]!.trim()}`;
  }

  return trimmed;
}

export function localizeNotificationBody(body: string, locale: NotificationLocale): string {
  const rawTrimmed = body.trim();
  if (!rawTrimmed) return rawTrimmed;
  const normalized = rawTrimmed.replace(
    /Repository khóa học\s*·\s*reference/gi,
    locale === "en" ? "Course repository · reference" : "Kho mã nguồn khóa học · tham chiếu",
  );
  if (locale === "en") return normalized;
  const trimmed = normalized;
  if (EXACT_BODY_MAP[trimmed]) return EXACT_BODY_MAP[trimmed];

  const executionMatch = /^(.+?)\.\s*Execution:\s*([^.]+)\.\s*Review evidence and cleanup\.$/i.exec(trimmed);
  if (executionMatch) {
    return `${executionMatch[1]!.trim()}. Trạng thái thực thi: ${translateStatusToken(executionMatch[2]!)}. Hãy kiểm tra bằng chứng và dọn dẹp phiên.`;
  }

  const resultMatch = /^(.+?)\.\s*Open the result to review the outcome\.$/i.exec(trimmed);
  if (resultMatch) {
    return `${resultMatch[1]!.trim()}. Mở kết quả để xem báo cáo phân tích chi tiết.`;
  }

  const modelRevMatch = /^(.+?)\.\s*A new model revision is available for review\.$/i.exec(trimmed);
  if (modelRevMatch) {
    return `${modelRevMatch[1]!.trim()}. Đã có phiên bản mô hình kiến trúc mới sẵn sàng kiểm tra.`;
  }

  const workspaceAccessMatch = /^(.+?)\.\s*Review your workspace access\.$/i.exec(trimmed);
  if (workspaceAccessMatch) {
    return `${workspaceAccessMatch[1]!.trim()}. Hãy kiểm tra quyền truy cập lớp học của bạn.`;
  }

  const memberJoinedMatch = /^A member has joined\s+(.+?)\.?$/i.exec(trimmed);
  if (memberJoinedMatch) {
    return `Một thành viên mới vừa tham gia lớp ${memberJoinedMatch[1]!.trim()}.`;
  }

  const assignmentRemovedMatch = /^(.+?)\s+was removed\.$/i.exec(trimmed);
  if (assignmentRemovedMatch) {
    return `Bài Lab "${assignmentRemovedMatch[1]!.trim()}" đã bị gỡ khỏi lớp học.`;
  }

  const assignmentUpdatedMatch = /^(.+?)\.\s*Review the instructions and deadline\.$/i.exec(trimmed);
  if (assignmentUpdatedMatch) {
    return `${assignmentUpdatedMatch[1]!.trim()}. Hãy xem hướng dẫn thực hành và hạn nộp bài.`;
  }

  const dueOneHourMatch = /^(.+?)\s+is due within one hour\.$/i.exec(trimmed);
  if (dueOneHourMatch) {
    return `Bài Lab "${dueOneHourMatch[1]!.trim()}" chỉ còn 1 giờ trước hạn nộp.`;
  }

  const dueDayMatch = /^(.+?)\s+is due within 24 hours\.$/i.exec(trimmed);
  if (dueDayMatch) {
    return `Bài Lab "${dueDayMatch[1]!.trim()}" sẽ đến hạn trong vòng 24 giờ tới.`;
  }

  const isNowAvailableMatch = /^(.+?)\s+is now available\.$/i.exec(trimmed);
  if (isNowAvailableMatch) {
    return `${isNowAvailableMatch[1]!.trim()} hiện đã được mở khóa — bạn có thể bắt đầu ngay.`;
  }

  const isNowStatusMatch = /^(.+?)\s+is now\s+([^.]+)\.?$/i.exec(trimmed);
  if (isNowStatusMatch) {
    return `${isNowStatusMatch[1]!.trim()} hiện đang ở trạng thái: ${translateStatusToken(isNowStatusMatch[2]!)}.`;
  }

  const healthCheckMatch = /^(.+?)\s+health check reports\s+([^.]+)\.\s*Review System Health\.$/i.exec(trimmed);
  if (healthCheckMatch) {
    return `Dịch vụ ${healthCheckMatch[1]!.trim()} đang báo cáo trạng thái ${translateStatusToken(healthCheckMatch[2]!)}. Hãy kiểm tra mục Tình trạng Hệ thống.`;
  }

  const recoveredMatch = /^(.+?)\s+is responding again\.$/i.exec(trimmed);
  if (recoveredMatch) {
    return `Dịch vụ ${recoveredMatch[1]!.trim()} đã phản hồi ổn định trở lại.`;
  }

  return trimmed;
}

export function localizeNotification(
  item: { title: string; body: string },
  locale: NotificationLocale,
): { title: string; body: string } {
  return {
    title: localizeNotificationTitle(item.title, locale),
    body: localizeNotificationBody(item.body, locale),
  };
}
