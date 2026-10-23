import type { ArchitecturalModel, Evidence } from "@/types/domain";
export const RULE_SET = "3e-2";
export const ruleNames: Record<string, string> = {
  "RULE-01": "Vòng phụ thuộc giữa các service",
  "RULE-02": "Ranh giới dữ liệu giữa các service",
  "RULE-03": "Service ít kết nối trong mô hình",
  "RULE-04": "Căn cứ cho các quan hệ",
  "RULE-05": "Ánh xạ cần xác minh",
};
export const resultNames: Record<string, string> = {
  PASS: "Đạt trong phạm vi đã kiểm tra",
  VIOLATION: "Có điểm cần xem xét",
  NEEDS_REVIEW: "Cần xác minh",
  NOT_APPLICABLE: "Không áp dụng",
};
export function sourceLabel(evidence: Pick<Evidence, "kind" | "sourceType">) {
  const type = evidence.sourceType?.toUpperCase() ?? "";
  if (type.startsWith("RUNTIME")) return "Quan sát khi chạy";
  if (type.includes("CONFIG") || type.includes("COMPOSE")) return "Từ cấu hình";
  if (type.includes("SOURCE") || type.includes("AST") || type.includes("CODE"))
    return "Từ mã nguồn";
  if (type.includes("USER")) return "Người dùng xác nhận";
  return "Nguồn chưa phân loại";
}
export function shortLocator(location: string) {
  const normalized = location.replaceAll("\\", "/");
  const extracted = normalized.match(/_source_extracted\/[^/]+\/(.+)$/);
  if (extracted) return extracted[1]!;
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("/"))
    return normalized.split("/").slice(-3).join("/");
  return normalized || "Chưa có vị trí source";
}
export function selectionSummary(model: ArchitecturalModel, id: string) {
  const node = model.elements.find((node) => node.id === id),
    edge = model.edges.find((edge) => edge.id === id);
  const name = (id: string) =>
    model.elements.find((node) => node.id === id)?.name ?? "Đối tượng chưa phân giải";
  if (edge) {
    const meaning: Record<string, string> = {
      DATABASE_ACCESS:
        "Mô hình ánh xạ một quan hệ truy cập dữ liệu. Cần xem cả source và datasource để xác minh đích dữ liệu.",
      DECLARED_COMPOSE:
        "Cấu hình triển khai khai báo phụ thuộc khởi động; quan hệ này chưa chứng minh có gọi API hay truy cập dữ liệu.",
      CODE_DEPENDENCY:
        "Source khai báo một phụ thuộc giữa các thành phần; thứ tự thực thi chưa được xác định.",
      SERVICE_HTTP_CALL:
        "Mô hình ghi nhận một lời gọi HTTP giữa hai đầu mút. Xem nguồn để phân biệt khai báo với quan sát thực tế.",
      MESSAGE_PUBLISH:
        "Source/cấu hình khai báo việc gửi tới kênh thông điệp; chưa xác nhận thông điệp đã được chuyển.",
      MESSAGE_SUBSCRIBE:
        "Source/cấu hình khai báo xử lý thông điệp từ kênh; chưa xác nhận đã thực thi.",
    };
    return {
      title: `${name(edge.from)} → ${name(edge.to)}`,
      type: "Quan hệ kiến trúc",
      summary:
        meaning[edge.protocol] ??
        "Quan hệ được lưu trong mô hình kiến trúc. Mở căn cứ để kiểm tra ý nghĩa và phạm vi.",
      connections: [edge],
      node,
      edge,
    };
  }
  const connections = model.edges.filter((edge) => edge.from === id || edge.to === id);
  const role: Record<string, [string, string]> = {
    SERVICE_CONTAINER: ["Service / ứng dụng", "Đơn vị ứng dụng được nhận diện trong mô hình."],
    COMPONENT: [
      "Thành phần bên trong service",
      "Thành phần được trích xuất từ source; vai trò kiến trúc cần đối chiếu ngữ cảnh.",
    ],
    DATABASE: [
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Database logic"
        : "Cơ sở dữ liệu · phạm vi cần xác minh",
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Đích dữ liệu được ánh xạ từ cấu hình của ứng dụng."
        : "Chưa đủ thông tin ở node này để phân biệt máy chủ dữ liệu với database/schema logic.",
    ],
    MESSAGE_CHANNEL: [
      "Kênh thông điệp",
      "Kênh gửi hoặc xử lý thông điệp đã khai báo; chưa khẳng định có trao đổi khi chạy.",
    ],
    QUEUE_BROKER: [
      "Hạ tầng thông điệp",
      "Tài nguyên phục vụ trao đổi thông điệp được nhận diện trong mô hình.",
    ],
    EXTERNAL_SYSTEM: [
      "Hệ thống bên ngoài",
      "Phần tử được mô hình phân loại là hệ thống bên ngoài; ranh giới cần đối chiếu dự án.",
    ],
  };
  const [type, summary] = role[node?.elementType ?? ""] ?? [
    "Phần tử kiến trúc",
    "Vai trò của phần tử này chưa được phân loại đầy đủ.",
  ];
  const responsibilities: Record<string, string> = {
    "Exposes HTTP endpoints": "Source khai báo thành phần cung cấp endpoint HTTP.",
    "Persists and retrieves application data":
      "Source khai báo thành phần lưu và truy xuất dữ liệu ứng dụng.",
    "Implements application operations":
      "Source nhận diện thành phần thực hiện các thao tác ứng dụng.",
    "Declares message publishing or handling endpoints":
      "Source khai báo thành phần gửi hoặc xử lý thông điệp.",
    "Spring application component": "Thành phần ứng dụng được khai báo bằng Spring.",
  };
  const responsibility =
    typeof node?.properties?.["responsibility"] === "string"
      ? responsibilities[node.properties["responsibility"]]
      : undefined;
  const children = model.elements.filter((child) => child.parentId === node?.id);
  const description =
    responsibility ??
    (node?.elementType === "SERVICE_CONTAINER" && children.length
      ? "Mô hình xếp " + children.length + " thành phần đã trích xuất vào ứng dụng này."
      : summary);
  const owner = model.elements.find((parent) => parent.id === node?.parentId);
  return {
    title: node?.name ?? "Chưa xác định",
    type,
    summary: description + (owner ? ` Thuộc ${owner.name}.` : ""),
    connections,
    node,
    edge,
  };
}
export function findingRelated(finding: Record<string, unknown>, id: string) {
  const details = finding["details"] as Record<string, unknown> | null | undefined;
  return (
    finding["elementId"] === id ||
    finding["relationshipId"] === id ||
    [details?.["relatedElementIds"], details?.["relatedRelationshipIds"]].some(
      (ids) => Array.isArray(ids) && ids.includes(id),
    )
  );
}
