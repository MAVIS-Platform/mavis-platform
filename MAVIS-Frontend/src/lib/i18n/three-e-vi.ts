import type { ArchitecturalModel, Evidence } from "@/types/domain";
import type { ThreeEAiSimplifiedExplanation, ThreeESubjectContext } from "@/features/architecture/three-e-content";

function shortLocator(location: string): string {
  const normalized = location.replaceAll("\\", "/");
  const extracted = normalized.match(/_source_extracted\/[^/]+\/(.+)$/);
  if (extracted) return extracted[1]!;
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("/"))
    return normalized.split("/").slice(-3).join("/");
  return normalized || "Chưa có vị trí mã nguồn";
}

export const ruleNamesVi: Record<string, string> = {
  "RULE-01": "Phụ thuộc vòng giữa các Service",
  "RULE-02": "Ranh giới quyền sở hữu dữ liệu giữa các Service",
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

export function getRuleNameVi(ruleId: string): string {
  return ruleNamesVi[ruleId] ?? ruleId;
}

export function getResultNameVi(status: string): string {
  return resultNamesVi[status] ?? status;
}

export function sourceLabelVi(evidence: Pick<Evidence, "kind" | "sourceType">): string {
  const type = evidence.sourceType?.toUpperCase() ?? "";
  if (type.startsWith("RUNTIME")) return "Quan sát từ Runtime";
  if (type.includes("CONFIG") || type.includes("COMPOSE")) return "Từ tệp cấu hình";
  if (type.includes("SOURCE") || type.includes("AST") || type.includes("CODE"))
    return "Từ mã nguồn";
  if (type.includes("USER")) return "Người dùng xác nhận";
  return "Nguồn chưa phân loại";
}

export function selectionSummaryVi(model: ArchitecturalModel, id: string) {
  const node = model.elements.find((n) => n.id === id);
  const edge = model.edges.find((e) => e.id === id);
  const name = (elemId: string) =>
    model.elements.find((n) => n.id === elemId)?.name ?? "Phần tử chưa phân giải";

  if (edge) {
    const umlRelKind =
      typeof edge.properties?.["umlRelationKind"] === "string"
        ? edge.properties["umlRelationKind"]
        : null;
    const meaning: Record<string, string> = {
      DATABASE_ACCESS:
        "Mô hình ánh xạ một mối quan hệ truy cập dữ liệu. Hãy kiểm tra cả mã nguồn và cấu hình datasource để xác minh kho dữ liệu đích.",
      DECLARED_COMPOSE:
        "Cấu hình triển khai Docker Compose khai báo phụ thuộc khởi động; mối quan hệ này chưa xác minh lệnh gọi API lúc chạy hoặc truy cập dữ liệu thực tế.",
      CODE_DEPENDENCY: umlRelKind
        ? `Mã nguồn khai báo mối quan hệ UML ${umlRelKind} giữa hai Classifier; chưa xác định thứ tự thực thi.`
        : "Mã nguồn khai báo phụ thuộc tĩnh giữa các Component; chưa xác định thứ tự thực thi.",
      SERVICE_HTTP_CALL:
        "Mô hình ghi nhận một phụ thuộc HTTP được khai báo. Hãy kiểm tra bằng chứng để phân biệt giữa khai báo tĩnh và lưu lượng thực tế lúc chạy.",
      DECLARED_LINK: "Docker Compose khai báo liên kết giữa các Container; chưa xác lập lệnh gọi HTTP hoặc hành vi nghiệp vụ.",
      CONFIGURATION_DEPENDENCY: "Cấu hình khai báo phụ thuộc tới Configuration Server; chưa quan sát thấy việc thực thi lúc chạy.",
      SERVICE_DISCOVERY: "Cấu hình khai báo phụ thuộc tới Service Discovery; chưa xác minh việc đăng ký dịch vụ lúc chạy.",
      TRACING_EXPORT: "Cấu hình khai báo Endpoint xuất Trace; chưa xác minh việc gửi dữ liệu Trace thực tế.",
      GATEWAY_ROUTE: "Cấu hình khai báo một tuyến HTTP Gateway; chưa chứng minh có request nào đã đi qua tuyến này.",
      CONFIGURED_ENDPOINT: "Cấu hình tham chiếu tới một Endpoint; việc tham chiếu đơn thuần chưa chứng minh Endpoint đó được gọi.",
      MESSAGE_PUBLISH:
        "Mã nguồn hoặc cấu hình khai báo việc phát thông điệp vào kênh; chưa xác minh việc truyền thông điệp lúc chạy.",
      MESSAGE_SUBSCRIBE:
        "Mã nguồn hoặc cấu hình khai báo việc nhận thông điệp từ kênh; chưa xác minh việc xử lý lúc chạy.",
    };
    return {
      title: `${name(edge.from)} → ${name(edge.to)}`,
      type: umlRelKind ? `Quan hệ UML · ${umlRelKind}` : "Mối quan hệ Kiến trúc",
      summary:
        meaning[edge.protocol] ??
        "Mối quan hệ được ghi nhận trong mô hình kiến trúc. Hãy kiểm tra bằng chứng để xác minh ngữ nghĩa và phạm vi.",
      connections: [edge],
      node,
      edge,
    };
  }

  const connections = model.edges.filter((e) => e.from === id || e.to === id);
  const role: Record<string, [string, string]> = {
    SERVICE_CONTAINER: [
      "Service / Application Container",
      "Đơn vị Service hoặc ứng dụng có thể triển khai được nhận diện trong mô hình.",
    ],
    COMPONENT: [
      "Component nội bộ của Service",
      "Component được trích xuất từ mã nguồn; hãy kiểm tra vai trò kiến trúc của nó trong ngữ cảnh.",
    ],
    CLASS_INTERFACE: [
      "UML Classifier",
      "Classifier được trích xuất từ AST mã nguồn phục vụ các góc nhìn UML Class, Package, Activity và State.",
    ],
    DATABASE: [
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Kho dữ liệu logic"
        : "Database · Cần xác minh phạm vi",
      node?.properties?.["resourceRole"] === "LOGICAL_DATASTORE"
        ? "Kho dữ liệu logic đích được ánh xạ từ cấu hình ứng dụng."
        : "Chưa đủ siêu dữ liệu trên nút này để phân biệt giữa máy chủ cơ sở dữ liệu vật lý và lược đồ (schema) logic.",
    ],
    MESSAGE_CHANNEL: [
      "Kênh thông điệp",
      "Kênh phát hoặc nhận thông điệp được khai báo; lưu lượng thông điệp lúc chạy chưa được xác nhận.",
    ],
    QUEUE_BROKER: [
      "Hạ tầng Message Broker",
      "Tài nguyên hạ tầng Message Broker được nhận diện trong mô hình.",
    ],
    EXTERNAL_SYSTEM: [
      "Hệ thống bên ngoài",
      "Phần tử được phân loại là hệ thống bên ngoài; hãy kiểm tra ranh giới hệ thống với phạm vi dự án.",
    ],
  };

  const [type, summary] = role[node?.elementType ?? ""] ?? [
    "Phần tử kiến trúc",
    "Vai trò kiến trúc của phần tử này chưa được phân loại hoàn chỉnh.",
  ];

  const responsibilities: Record<string, string> = {
    "Exposes HTTP endpoints": "Mã nguồn khai báo Component cung cấp các HTTP Endpoint.",
    "Persists and retrieves application data":
      "Mã nguồn khai báo Component lưu trữ và truy xuất dữ liệu ứng dụng.",
    "Implements application operations":
      "Mã nguồn xác định Component thực thi các nghiệp vụ của ứng dụng.",
    "Declares message publishing or handling endpoints":
      "Mã nguồn khai báo Component phát hoặc xử lý các thông điệp bất đồng bộ.",
    "Spring application component": "Component ứng dụng được khai báo qua chú thích (annotation) Spring.",
  };

  const responsibility =
    typeof node?.properties?.["responsibility"] === "string"
      ? responsibilities[node.properties["responsibility"]]
      : undefined;
  const children = model.elements.filter((child) => child.parentId === node?.id);
  const description =
    responsibility ??
    (node?.elementType === "SERVICE_CONTAINER" && children.length
      ? `Mô hình gom nhóm ${children.length} Component trích xuất từ mã nguồn bên trong Service này.`
      : summary);
  const owner = model.elements.find((parent) => parent.id === node?.parentId);

  return {
    title: node?.name ?? "Chưa xác định",
    type,
    summary: description + (owner ? ` Thuộc về ${owner.name}.` : ""),
    connections,
    node,
    edge,
  };
}

export function explainEvidenceSnippetSimplyVi(
  item: Pick<Evidence, "kind" | "sourceType" | "location" | "snippet">,
  subjectTitle?: string,
): string {
  const loc = shortLocator(item.location);
  const snippet = item.snippet ?? "";
  const lower = (loc + "\n" + snippet).toLowerCase();
  const target = subjectTitle ? `"${subjectTitle}"` : "phần tử đang chọn";

  if (item.sourceType?.toUpperCase().startsWith("RUNTIME")) {
    return `Bằng chứng Runtime Trace tại ${loc}: ghi nhận lệnh gọi, độ trễ và mã trạng thái phản hồi của ${target}.`;
  }
  if (
    lower.includes("docker-compose") ||
    loc.endsWith(".yml") ||
    loc.endsWith(".yaml") ||
    loc.endsWith(".properties")
  ) {
    return `Bằng chứng cấu hình hạ tầng (${loc}): khai báo thiết lập Container, biến môi trường, cổng mạng hoặc kết nối Database / Message Broker cho ${target}.`;
  }
  if (
    lower.includes("@restcontroller") ||
    lower.includes("@controller") ||
    lower.includes("@requestmapping") ||
    lower.includes("@postmapping") ||
    lower.includes("@getmapping") ||
    lower.includes("controller.java")
  ) {
    return `Bằng chứng điểm vào API (${loc}): tiếp nhận HTTP request đầu vào và chuyển tiếp xử lý xuống tầng nghiệp vụ (Service) của ${target}.`;
  }
  if (
    lower.includes("saga") ||
    lower.includes("command") ||
    lower.includes("domainevent") ||
    lower.includes("eventpublisher") ||
    lower.includes("messageproducer") ||
    lower.includes("kafkatemplate")
  ) {
    return `Bằng chứng giao tiếp sự kiện bất đồng bộ (${loc}): phát (publish) hoặc tiêu thụ (consume) các thông điệp/sự kiện liên Service liên quan đến ${target}.`;
  }
  if (
    lower.includes("@entity") ||
    lower.includes("@table") ||
    lower.includes("repository") ||
    lower.includes("jparepository") ||
    lower.includes("crudrepository")
  ) {
    return `Bằng chứng tầng lưu trữ dữ liệu (${loc}): định nghĩa ánh xạ Entity hoặc các thao tác truy vấn Database qua Repository cho ${target}.`;
  }
  if (lower.includes("@service") || lower.includes("@transactional") || lower.includes("service.java")) {
    return `Bằng chứng tầng xử lý nghiệp vụ (${loc}): hiện thực hóa logic nghiệp vụ cốt lõi và điều phối giao dịch (transaction) cho ${target}.`;
  }
  if (lower.includes("pom.xml") || lower.includes("build.gradle")) {
    return `Khai báo phụ thuộc gói xây dựng (${loc}): chỉ định các thư viện và module phụ thuộc được ${target} sử dụng.`;
  }
  return `Bằng chứng mã nguồn tại ${loc} minh họa trực tiếp khai báo và hành vi của ${target}.`;
}

export function buildDeterministicThreeESimplifiedVi(
  model: ArchitecturalModel,
  ctx: ThreeESubjectContext,
  concreteEvidences: readonly Evidence[],
  matchingFindings: readonly Record<string, unknown>[],
): ThreeEAiSimplifiedExplanation {
  const { node, edge, title, connections } = ctx.subject;
  const saved = concreteEvidences.filter(
    (ev) => ev.origin !== "preview" && ev.sourceType !== "MODEL_METADATA_PREVIEW",
  );
  const kinds: Record<string, string> = {
    DECLARED_COMPOSE: "phụ thuộc khởi động; chưa chứng minh lưu lượng HTTP thực tế",
    SERVICE_HTTP_CALL:
      "phụ thuộc HTTP được khai báo; lưu lượng lúc chạy và mục đích nghiệp vụ chưa được xác lập",
    CONFIGURATION_DEPENDENCY: "phụ thuộc cấu hình tới Configuration Server",
    SERVICE_DISCOVERY: "phụ thuộc đăng ký dịch vụ tới Service Discovery",
    TRACING_EXPORT: "điểm xuất dữ liệu Trace",
    GATEWAY_ROUTE: "tuyến định tuyến HTTP Gateway",
    CONFIGURED_ENDPOINT: "tham chiếu Endpoint được cấu hình; việc kích hoạt chưa được xác lập",
  };
  const explainSimple = node
    ? `Mô hình phân loại "${title}" là ${node.elementType ?? "một phần tử"}. Tên gọi và số lượng kết nối chưa đủ để xác lập vai trò nghiệp vụ hoặc hành vi lúc chạy.`
    : edge
      ? `Mô hình ghi nhận ${kinds[edge.protocol] ?? `mối quan hệ ${edge.protocol} được khai báo`}.`
      : ctx.subject.summary;
  const grounding = {
    status: saved.length ? ("PARTIAL_SOURCE" as const) : ("MODEL_ONLY" as const),
    suppliedSnippets: Math.min(saved.length, 6),
    omittedSnippets: Math.max(0, saved.length - 6),
    notice: saved.length
      ? "Chỉ diễn giải dựa trên các đoạn mã bằng chứng đang chọn; đây chưa phải là xác minh toàn bộ mã nguồn hoặc Runtime."
      : "Chỉ có siêu dữ liệu mô hình. Chưa có đoạn mã nguồn trích xuất trực tiếp; hành vi chi tiết và vai trò nghiệp vụ chưa được xác lập.",
  };
  return {
    explainSimple,
    exploreSimple: saved.length
      ? `${saved.length} đoạn mã nguồn/cấu hình đã lưu được đính kèm (${saved
          .slice(0, 3)
          .map((item) => shortLocator(item.location))
          .join(", ")}); hãy kiểm tra phạm vi chính xác bên dưới.`
      : "Chưa có đoạn mã nguồn đã lưu nào được đính kèm. Bản dựng lại siêu dữ liệu chỉ là bản xem trước, không phải bằng chứng mã nguồn.",
    evaluateSimple: matchingFindings.length
      ? `${matchingFindings.length} phát hiện quy tắc cần rà soát: ${String(matchingFindings[0]?.["message"] ?? "Chưa có chi tiết")}`
      : `Không có phát hiện vi phạm nào gắn với phần tử này. Điều này không đồng nghĩa với việc kiến trúc hoàn toàn đúng đắn, khớp nối lỏng hay an toàn vận hành (${connections.length} kết nối được khai báo).`,
    snippetNotes: Object.fromEntries(
      concreteEvidences.map((ev) => [
        ev.id,
        ev.origin === "preview"
          ? "Chỉ là bản xem trước siêu dữ liệu; đây không phải là mã nguồn nguyên văn và không thể chứng minh chi tiết hiện thực."
          : explainEvidenceSnippetSimplyVi(ev, title),
      ]),
    ),
    assumptions: [],
    unknowns: [grounding.notice],
    grounding,
  };
}

export function threeERefusalMessageVi(
  reason: "off-topic" | "wrong-service",
  tCtx: { title: string; type: string },
  foreignMatch?: string,
): string {
  if (reason === "wrong-service" && foreignMatch) {
    return `Bạn đang chọn "${tCtx.title}", nhưng câu hỏi lại đề cập đến "${foreignMatch}". Vui lòng bấm chọn "${foreignMatch}" trên đồ thị trước, hoặc hỏi về "${tCtx.title}" cùng các kết nối trực tiếp của nó.`;
  }
  return `Tôi chỉ trả lời các câu hỏi về kiến trúc phần mềm, bằng chứng mã nguồn, phụ thuộc kết nối và đánh giá thiết kế của "${tCtx.title}" (${tCtx.type}). Vui lòng đặt câu hỏi xoay quanh phần tử đang chọn.`;
}


export function translateRuleTitleVi(code: string, fallbackTitle: string): string {
  const map: Record<string, string> = {
    "EVAL-CYCLE": "Phụ thuộc vòng giữa các Service",
    "EVAL-SHARED-DB": "Ranh giới quyền sở hữu dữ liệu giữa các Service",
    "EVAL-HUB": "Mật độ kết nối phụ thuộc của các Service",
    "EVAL-GOD-SERVICE": "Service ôm đồm quá nhiều trách nhiệm",
    "EVAL-ORPHAN": "Thành phần cô lập chưa có kết nối",
    "EVAL-DIRECT-DB": "Truy cập trực tiếp Database bỏ qua tầng nghiệp vụ",
    "EVAL-SYNC-CHAIN": "Chuỗi gọi HTTP đồng bộ quá sâu",
    "EVAL-MISSING-RESILIENCE": "Thiếu cơ chế chịu lỗi khi gọi liên Service",
  };
  return map[code] ?? fallbackTitle;
}

export function translateRuleSummaryVi(
  code: string,
  status: string,
  summary: string,
): string {
  if (code === "EVAL-CYCLE") {
    if (status === "PASS") {
      return "Không phát hiện vòng lặp phụ thuộc trực tiếp 2 chiều giữa các Service.";
    }
    const m = summary.match(/Detected\s+(\d+)\s+direct two-node dependency cycle\(s\)\.?/i);
    if (m) {
      return `Phát hiện ${m[1]} vòng lặp phụ thuộc trực tiếp 2 chiều giữa các Service.`;
    }
  }

  if (code === "EVAL-SHARED-DB") {
    if (status === "PASS") {
      return "Mỗi kho dữ liệu chỉ được truy cập bởi một Service sở hữu duy nhất.";
    }
    const m = summary.match(/(\d+)\s+datastore\(s\)\s+are accessed by multiple services\.?/i);
    if (m) {
      return `Có ${m[1]} kho dữ liệu đang bị truy cập chung bởi nhiều Service khác nhau.`;
    }
  }

  if (code === "EVAL-HUB") {
    if (status === "PASS") {
      return "Bậc kết nối vào/ra của các thành phần đều nằm trong ngưỡng an toàn (<= 6).";
    }
    const m = summary.match(/(\d+)\s+element\(s\)\s+have high fan-in\/fan-out degree \(> 6\)\.?/i);
    if (m) {
      return `Có ${m[1]} thành phần có mật độ kết nối vào/ra quá cao (> 6 kết nối).`;
    }
  }

  return summary;
}

export function translateRuleRationaleVi(code: string, rationale: string): string {
  const map: Record<string, string> = {
    "EVAL-CYCLE":
      "Phụ thuộc vòng giữa các Service làm tăng độ kết dính, gây khó khăn khi triển khai độc lập và dễ dẫn đến lỗi dây chuyền khi một Service gặp sự cố.",
    "EVAL-SHARED-DB":
      "Việc dùng chung Database giữa nhiều Microservice phá vỡ tính đóng gói dữ liệu và tạo sự phụ thuộc ngầm ở tầng Schema khi nâng cấp hệ thống.",
    "EVAL-HUB":
      "Một thành phần có quá nhiều kết nối vào/ra thường là dấu hiệu của việc tập trung quá nhiều trách nhiệm hoặc trở thành điểm nghẽn cổ chai của toàn hệ thống.",
  };
  return map[code] ?? rationale;
}

export function translateRuleRecommendationVi(
  code: string,
  recommendation: string,
): string {
  const map: Record<string, string> = {
    "EVAL-CYCLE":
      "Tách hợp đồng giao tiếp chung ra thư viện độc lập hoặc chuyển sang giao tiếp bất đồng bộ qua sự kiện (Event-driven) để phá vỡ vòng lặp phụ thuộc.",
    "EVAL-SHARED-DB":
      "Phân tách rõ quyền sở hữu bảng/schema cho từng Service và chỉ trao đổi dữ liệu qua API hoặc sự kiện bất đồng bộ.",
    "EVAL-HUB":
      "Xem xét tách nhỏ thành phần có mật độ kết nối cao thành các phần tử chuyên biệt theo từng miền nghiệp vụ.",
  };
  return map[code] ?? recommendation;
}

export function translateFindingExplanationVi(explanation: string): string {
  let out = explanation;

  out = out.replace(
    /^([^\s]+)\s+and\s+([^\s]+)\s+depend on each other directly\.?$/i,
    "Hai thành phần $1 và $2 đang phụ thuộc trực tiếp lẫn nhau (gọi 2 chiều).",
  );

  out = out.replace(
    /^Datastore\s+([^\s]+)\s+is shared across\s+(\d+)\s+services:\s+(.+)\.?$/i,
    "Kho dữ liệu $1 đang bị dùng chung bởi $2 Service: $3.",
  );

  out = out.replace(
    /^([^\s]+)\s+has\s+(\d+)\s+connected relationships\s+\(fan-in\s+(\d+),\s+fan-out\s+(\d+)\)\.?$/i,
    "Thành phần $1 có tổng cộng $2 mối quan hệ kết nối (gọi đến: $3, gọi đi: $4).",
  );

  return out;
}

export function translateRuleExplanationVi(explanation: string): string {
  let out = explanation;

  out = out.replace(
    /^([^\s]+)\s+is a\s+([^\s]+)\s+in\s+([^\s]+)\s+layer with\s+(\d+)\s+incoming and\s+(\d+)\s+outgoing relationships\.?$/i,
    "$1 là một phần tử thuộc loại $2 nằm ở tầng $3, có $4 kết nối gọi đến và $5 kết nối gọi đi.",
  );

  out = out.replace(
    /^([^\s]+)\s+connects to\s+([^\s]+)\s+via\s+([^\s]+)\s+\(confidence\s+(\d+)%\)\.?$/i,
    "$1 kết nối tới $2 thông qua giao thức $3 (độ tin cậy $4%).",
  );

  return out;
}

export function translateSourceTypeVi(sourceType: string): string {
  const map: Record<string, string> = {
    STATIC_AST: "Phân tích cây cú pháp AST",
    AST: "Phân tích cây cú pháp AST",
    CONFIG_FILE: "Tệp cấu hình",
    CONFIG: "Tệp cấu hình",
    DOCKER_COMPOSE: "Tệp Docker Compose",
    OPENAPI: "Đặc tả OpenAPI",
    RUNTIME_TRACE: "Truy vết thực thi Runtime",
    RUNTIME: "Quan sát từ Runtime",
    USER_MANUAL: "Người dùng xác nhận thủ công",
    AI_INFERRED: "Suy luận ngữ cảnh AI",
    SPRING_ANNOTATION: "Annotation Spring Framework",
    FEIGN_CLIENT: "Khai báo FeignClient",
    REST_TEMPLATE: "Lời gọi RestTemplate / WebClient",
    JPA_ENTITY: "Ánh xạ thực thể JPA / Database",
    MESSAGE_LISTENER: "Khai báo hàng đợi Message Broker",
  };
  return map[sourceType.toUpperCase()] ?? sourceType;
}

export function translateDetectorVi(detector: string): string {
  const map: Record<string, string> = {
    "spring-web-detector": "Bộ nhận diện Spring Web Endpoint",
    "feign-client-detector": "Bộ nhận diện giao tiếp FeignClient",
    "rest-template-detector": "Bộ nhận diện lời gọi HTTP Client",
    "docker-compose-detector": "Bộ phân tích cấu hình Docker Compose",
    "spring-config-detector": "Bộ phân tích cấu hình Spring",
    "jpa-datasource-detector": "Bộ nhận diện kết nối Database / JPA",
    "messaging-detector": "Bộ nhận diện kết nối Message Broker",
    "otel-trace-mapper": "Bộ ánh xạ OpenTelemetry Runtime Trace",
    "manual-model-editor": "Chỉnh sửa mô hình thủ công",
  };
  return map[detector] ?? detector;
}

export function translateEvidenceExcerptVi(excerpt: string): string {
  if (!excerpt) return excerpt;
  let out = excerpt;

  out = out.replace(
    /^Resolved HTTP call from\s+(.+)\s+to\s+(.+)$/i,
    "Xác nhận lời gọi HTTP từ $1 tới $2",
  );
  out = out.replace(
    /^Docker compose dependency:\s*(.+)$/i,
    "Phụ thuộc khai báo trong Docker Compose: $1",
  );
  out = out.replace(
    /^Observed runtime span:\s*(.+)$/i,
    "Span thu thập thực tế từ Runtime: $1",
  );
  out = out.replace(
    /^Environment variable reference:\s*(.+)$/i,
    "Tham chiếu biến môi trường cấu hình: $1",
  );

  return out;
}
