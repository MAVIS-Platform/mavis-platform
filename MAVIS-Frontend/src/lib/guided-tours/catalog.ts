export interface LocalizedText {
  en: string;
  vi: string;
}

export interface ScreenTourCard {
  badge: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface ScreenTourStep {
  id: string;
  selectors: readonly string[];
  title: LocalizedText;
  description: LocalizedText;
}

export interface ScreenTourDefinition {
  id: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  cards: readonly [ScreenTourCard, ScreenTourCard];
  steps: readonly ScreenTourStep[];
}

export const SCREEN_TOUR_CATALOG = {
  overview: {
    id: "overview",
    title: {
      en: "My Projects — Quick Start Guide",
      vi: "Dự án của tôi — Hướng dẫn bắt đầu nhanh",
    },
    subtitle: {
      en: "Your central dashboard to import software projects, check their readiness, and open their architecture workspace.",
      vi: "Bảng điều khiển trung tâm để nhập dự án phần mềm, kiểm tra trạng thái sẵn sàng và mở không gian khám phá kiến trúc.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Personal Architecture Exploration",
          vi: "Khám phá Kiến trúc Cá nhân",
        },
        description: {
          en: "Click Import project source (top right) → Enter a GitHub URL or upload a ZIP → Explore Architecture Graph, Diagrams, 3E Inspector & Runtime.",
          vi: "Bấm Nhập mã nguồn dự án (góc phải trên) → Dán link GitHub hoặc tải file ZIP → Khám phá Bản đồ kiến trúc, Sơ đồ C4/UML, Bằng chứng 3E & Chạy thử Runtime.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Dashboard & Class Coursework",
          vi: "Bảng điều khiển & Bài tập Lớp học",
        },
        description: {
          en: "Review your project counters, open any existing project from Recent projects, or switch to My Workspaces in the left sidebar for class assignments.",
          vi: "Xem nhanh thống kê dự án, mở dự án có sẵn trong bảng Dự án gần đây, hoặc chọn Không gian làm việc ở thanh bên trái để làm bài tập lớp học.",
        },
      },
    ],
    steps: [
      {
        id: "overview-summary",
        selectors: ['[data-tour="overview-summary"]', "main .grid"],
        title: {
          en: "1. Project Health Summary Cards",
          vi: "1. Thẻ tóm tắt tình trạng dự án",
        },
        description: {
          en: "See at a glance how many projects you have, how many microservices were discovered, how many finished static analysis, and how many are ready for sandbox runtime testing.",
          vi: "Xem nhanh tổng số dự án của bạn, tổng số dịch vụ (microservices) được phát hiện, số dự án đã phân tích xong và số dự án đủ điều kiện chạy thử Runtime.",
        },
      },
      {
        id: "overview-import",
        selectors: ['[data-tour="overview-import"]', "main button"],
        title: {
          en: "2. Import Project Source",
          vi: "2. Nhập mã nguồn dự án mới",
        },
        description: {
          en: "Click here anytime to add a new project from a public GitHub link or a ZIP file. MAVIS will automatically scan the code and build its architecture map.",
          vi: "Bấm vào đây bất cứ lúc nào để thêm dự án mới từ link GitHub công khai hoặc file ZIP. MAVIS sẽ tự động đọc code và dựng bản đồ kiến trúc cho bạn.",
        },
      },
      {
        id: "overview-projects",
        selectors: ['[data-tour="overview-projects"]', "main section"],
        title: {
          en: "3. Recent Projects List",
          vi: "3. Danh sách dự án gần đây",
        },
        description: {
          en: "Search or filter your projects by status. Click a project name (or the View button on the right) to enter its Project Workspace.",
          vi: "Tìm kiếm hoặc lọc dự án theo trạng thái. Bấm trực tiếp vào tên dự án (hoặc nút Xem ở bên phải) để bước vào Không gian làm việc của dự án đó.",
        },
      },
      {
        id: "overview-activity",
        selectors: ['[data-tour="overview-activity"]', "main section:last-of-type"],
        title: {
          en: "4. Recent Activity Timeline",
          vi: "4. Nhật ký hoạt động gần đây",
        },
        description: {
          en: "Track your latest code scans and deletions. Click Inspect on any completed run to jump straight to the generated architecture model.",
          vi: "Theo dõi các lần quét mã nguồn hoặc xóa tài nguyên gần nhất. Bấm Kiểm tra (Inspect) ở dòng đã hoàn tất để mở thẳng mô hình kiến trúc vừa tạo.",
        },
      },
    ],
  },

  import: {
    id: "import",
    title: {
      en: "Import Project Source — Step-by-Step Guide",
      vi: "Nhập mã nguồn dự án — Hướng dẫn từng bước",
    },
    subtitle: {
      en: "Bring your software repository into MAVIS from GitHub or a ZIP archive so the platform can analyze its structure automatically.",
      vi: "Đưa kho mã nguồn phần mềm vào MAVIS từ GitHub hoặc file nén ZIP để hệ thống tự động phân tích toàn bộ cấu trúc.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "What happens during Import?",
          vi: "Hệ thống làm gì khi Nhập mã nguồn?",
        },
        description: {
          en: "MAVIS takes a safe, read-only snapshot of your code, detects all services, databases, and APIs, and generates an initial static architecture model.",
          vi: "MAVIS chụp lại một bản sao an toàn (chỉ đọc) của mã nguồn, tự tìm các dịch vụ, cơ sở dữ liệu, API và dựng nên bản thiết kế kiến trúc ban đầu.",
        },
      },
      {
        badge: "2",
        title: {
          en: "GitHub URL or ZIP Upload",
          vi: "Dùng link GitHub hoặc tải file ZIP",
        },
        description: {
          en: "Paste a public GitHub repository link to pick a branch/commit, or upload a .zip archive directly from your computer.",
          vi: "Dán đường dẫn GitHub công khai để chọn nhánh (branch) hoặc phiên bản commit, hoặc tải trực tiếp file .zip từ máy tính của bạn.",
        },
      },
    ],
    steps: [
      {
        id: "import-name",
        selectors: ['input[aria-label="Project name"]', "main form", "main"],
        title: {
          en: "1. Name Your Project",
          vi: "1. Đặt tên cho dự án",
        },
        description: {
          en: "Give your project a clear, recognizable name (for example: Moc Huong Shop) so you can easily find it in your project list.",
          vi: "Đặt một cái tên dễ nhớ (ví dụ: Mộc Hương Shop) để bạn dễ dàng tìm thấy trong danh sách dự án của mình.",
        },
      },
      {
        id: "import-source",
        selectors: ['input[aria-label="GitHub repository URL"]', '[role="group"]', "main"],
        title: {
          en: "2. Provide Repository Source",
          vi: "2. Cung cấp nguồn mã (GitHub hoặc ZIP)",
        },
        description: {
          en: "Paste the root URL of a public GitHub repository (https://github.com/owner/repo) or switch to Upload ZIP if your code is stored on your machine.",
          vi: "Dán địa chỉ gốc của kho GitHub công khai (https://github.com/owner/repo) hoặc chuyển sang Tải lên ZIP nếu mã nguồn nằm trên máy tính.",
        },
      },
      {
        id: "import-branch",
        selectors: ["#import-branch-select", "select", "main"],
        title: {
          en: "3. Select Branch & Optional Commit",
          vi: "3. Chọn Nhánh (Branch) cần phân tích",
        },
        description: {
          en: "MAVIS automatically selects the default branch (such as main or master). You can keep it as-is or pick a specific development branch.",
          vi: "MAVIS tự động chọn sẵn nhánh mặc định (như main hoặc master). Bạn có thể giữ nguyên hoặc đổi sang nhánh khác muốn kiểm tra.",
        },
      },
      {
        id: "import-submit",
        selectors: ['button[type="submit"]', "main button"],
        title: {
          en: "4. Start Import & Automatic Analysis",
          vi: "4. Bấm Nhập & Tự động Phân tích",
        },
        description: {
          en: "Click the submit button to import the snapshot and immediately launch static architecture analysis.",
          vi: "Bấm nút xác nhận để hệ thống tải bản chụp mã nguồn và tự động chạy phân tích kiến trúc ngay lập tức.",
        },
      },
    ],
  },

  "project-overview": {
    id: "project-overview",
    title: {
      en: "Project Overview — Simple Guide",
      vi: "Tổng quan Dự án — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Think of this screen as your project's Mission Control: it shows the 5-step journey from raw source code to live runtime verification.",
      vi: "Hãy xem màn hình này như Trạm điều khiển trung tâm của dự án: hiển thị lộ trình 5 bước từ lúc nhập code đến khi chạy thử thực tế.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "The 5-Step Journey",
          vi: "Hành trình 5 bước chuẩn",
        },
        description: {
          en: "1. Source Snapshots → 2. Static Analysis → 3. Graph & 3E → 4. Architecture Diagrams → 5. Runtime Verification.",
          vi: "1. Bản chụp mã nguồn → 2. Phân tích tĩnh → 3. Bản đồ & Bằng chứng 3E → 4. Sơ đồ kiến trúc → 5. Chạy thử Runtime.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Quick Health Check",
          vi: "Kiểm tra sức khỏe dự án",
        },
        description: {
          en: "Check how many services and connections were found, and jump directly to the latest Model Revision or Runtime Session.",
          vi: "Xem nhanh số bộ phận (services) và đường kết nối đã tìm thấy, đồng thời mở nhanh phiên bản kiến trúc mới nhất.",
        },
      },
    ],
    steps: [
      {
        id: "po-workflow-bar",
        selectors: ['[data-tour="project-workflow-bar"]', "main .grid"],
        title: {
          en: "1. The 5-Step Architecture Workflow Bar",
          vi: "1. Thanh lộ trình 5 bước khám phá kiến trúc",
        },
        description: {
          en: "Follow these 5 cards from left to right: import code (Step 1), check revisions (Step 2), view the interactive map (Step 3), export diagrams (Step 4), and run live tests (Step 5).",
          vi: "Đi theo 5 ô từ trái sang phải: Nhập code (Bước 1) → Xem phiên bản phân tích (Bước 2) → Mở bản đồ mạng lưới (Bước 3) → Xuất sơ đồ báo cáo (Bước 4) → Chạy thử thực tế (Bước 5).",
        },
      },
      {
        id: "po-summary-cards",
        selectors: ['[data-tour="project-summary-cards"]', "main article"],
        title: {
          en: "2. Discovered Services & Connections",
          vi: "2. Thống kê Dịch vụ & Đường kết nối",
        },
        description: {
          en: "Shows the total number of microservices, connections between them, and whether the project can be started in the Runtime Sandbox.",
          vi: "Cho biết dự án có bao nhiêu bộ phận (microservices), bao nhiêu đường liên lạc giữa chúng, và dự án đã sẵn sàng để bật chạy thử hay chưa.",
        },
      },
      {
        id: "po-revisions",
        selectors: ['[data-tour="project-revisions"]', "main section"],
        title: {
          en: "3. Model Revisions & History",
          vi: "3. Danh sách các Phiên bản Kiến trúc (Revisions)",
        },
        description: {
          en: "Every time you scan code or complete a Runtime test, MAVIS saves a numbered Revision here so you can inspect or compare them anytime.",
          vi: "Mỗi lần quét code hoặc chạy thử Runtime xong, MAVIS đều lưu lại một Phiên bản (Revision) tại đây để bạn mở xem hoặc đối chiếu bất cứ lúc nào.",
        },
      },
      {
        id: "po-sidebar",
        selectors: ['aside[aria-label="Application sidebar"]', "nav"],
        title: {
          en: "4. Project Workspace Sidebar",
          vi: "4. Menu điều hướng Dự án bên trái",
        },
        description: {
          en: "Use the left menu to switch between Architecture (Graph, Diagrams, Editor), Analysis (Snapshots, Compare, Impact), Runtime (Steps 1–3), and AI Explanations.",
          vi: "Dùng thanh menu bên trái để chuyển nhanh giữa các mục: Kiến trúc (Bản đồ, Sơ đồ), Phân tích (Bản chụp, So sánh, Đánh giá tác động), Runtime (Bước 1–3) và Giải thích AI.",
        },
      },
    ],
  },

  snapshots: {
    id: "snapshots",
    title: {
      en: "Source Snapshots — Simple Guide",
      vi: "Bản chụp Mã nguồn (Snapshots) — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "A Snapshot is like a photograph of your project's source code at a specific point in time. MAVIS analyzes snapshots to build architecture models.",
      vi: "Mỗi Bản chụp (Snapshot) giống như một tấm ảnh chụp lại toàn bộ mã nguồn dự án tại một thời điểm. MAVIS đọc bản chụp này để vẽ ra sơ đồ kiến trúc.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Import New Code Versions",
          vi: "Cập nhật phiên bản code mới",
        },
        description: {
          en: "When you update code on GitHub, click Import new snapshot (top right) to pull the latest changes without losing older versions.",
          vi: "Khi bạn sửa code trên GitHub, hãy bấm Nhập bản chụp mới (góc phải trên) để lấy code mới nhất về mà vẫn giữ nguyên các bản phân tích cũ.",
        },
      },
      {
        badge: "2",
        title: {
          en: "View or Re-analyze",
          vi: "Mở xem hoặc Phân tích lại",
        },
        description: {
          en: "Click View on any completed snapshot to open its Architecture Graph, or click Re-analyze to scan the snapshot again.",
          vi: "Bấm Xem (View) ở bản chụp đã hoàn tất để mở Bản đồ kiến trúc, hoặc bấm Phân tích lại (Re-analyze) nếu muốn hệ thống quét lại.",
        },
      },
    ],
    steps: [
      {
        id: "snap-selector",
        selectors: ['[data-tour="project-selector"]', "main select", "main"],
        title: {
          en: "1. Active Project Selector",
          vi: "1. Chọn dự án đang làm việc",
        },
        description: {
          en: "Confirm which project you are viewing, or switch to another project directly from this dropdown.",
          vi: "Kiểm tra tên dự án bạn đang xem, hoặc đổi nhanh sang một dự án khác ngay tại ô chọn này.",
        },
      },
      {
        id: "snap-import-btn",
        selectors: ['[data-tour="snapshot-import-action"]', "main button"],
        title: {
          en: "2. Import New Snapshot Button",
          vi: "2. Nút Nhập bản chụp mới",
        },
        description: {
          en: "Click here whenever your team pushes new commits to GitHub and you want MAVIS to analyze the updated code.",
          vi: "Bấm nút này mỗi khi dự án trên GitHub có cập nhật mới và bạn muốn MAVIS đọc lại phiên bản mới đó.",
        },
      },
      {
        id: "snap-table",
        selectors: ['[data-tour="snapshots-table"]', "main table", "main section"],
        title: {
          en: "3. Snapshot Status & Generated Revisions",
          vi: "3. Bảng trạng thái Bản chụp & Phiên bản sinh ra",
        },
        description: {
          en: "Check the Branch/Commit column, wait for Analysis status to turn Completed (green), and click any Revision badge or View button to explore the architecture.",
          vi: "Xem nhánh code ở cột Branch/Commit, đợi trạng thái chuyển sang Hoàn tất (màu xanh), rồi bấm vào nhãn Revision hoặc nút View để xem bản đồ kiến trúc.",
        },
      },
    ],
  },

  "analysis-history": {
    id: "analysis-history",
    title: {
      en: "Analysis History — Simple Guide",
      vi: "Lịch sử Phân tích — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "A chronological log of every static code scan executed for this project, including timing, status, and resulting model revisions.",
      vi: "Nhật ký ghi lại theo thời gian toàn bộ các lần hệ thống quét và phân tích mã nguồn của dự án này.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Track Scan Progress",
          vi: "Theo dõi tiến độ quét mã nguồn",
        },
        description: {
          en: "See whether a scan is Queued, Processing, Completed, or Failed, along with its start and completion timestamps.",
          vi: "Biết ngay một lần phân tích đang Xếp hàng, Đang chạy, Đã hoàn tất hay Thất bại, kèm thời gian bắt đầu và kết thúc.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Jump to Resulting Model",
          vi: "Mở nhanh mô hình kết quả",
        },
        description: {
          en: "Every successful scan produces a numbered Model Revision that you can open in the Graph Explorer or Diagrams.",
          vi: "Mỗi lần quét thành công đều tạo ra một Phiên bản Mô hình (Revision) để bạn bấm vào mở xem Bản đồ hoặc Sơ đồ.",
        },
      },
    ],
    steps: [
      {
        id: "ah-selector",
        selectors: ["main select", "main"],
        title: {
          en: "1. Select Project",
          vi: "1. Chọn dự án cần xem lịch sử",
        },
        description: {
          en: "Switch between your projects to inspect their analysis run history.",
          vi: "Chọn dự án bạn muốn kiểm tra lịch sử các lần chạy phân tích mã nguồn.",
        },
      },
      {
        id: "ah-table",
        selectors: ["main table", "main section"],
        title: {
          en: "2. Analysis Runs Table",
          vi: "2. Bảng lịch sử các lần phân tích",
        },
        description: {
          en: "Each row shows one scan run, which Snapshot it read, whether it succeeded, and a link to inspect the resulting architecture revision.",
          vi: "Mỗi dòng là một lần hệ thống đọc code, cho biết đọc từ Bản chụp nào, kết quả ra sao và nút mở xem phiên bản kiến trúc tương ứng.",
        },
      },
    ],
  },

  architecture: {
    id: "architecture",
    title: {
      en: "Architecture Graph Explorer — Simple Guide",
      vi: "Bản đồ Kiến trúc (Graph Explorer) — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "An interactive map of your entire software system: circles represent services, databases, and message queues; lines show who talks to whom.",
      vi: "Bản đồ tương tác của toàn bộ phần mềm: mỗi hình tròn là một bộ phận (dịch vụ, kho dữ liệu, kênh tin nhắn); mỗi đường nối cho biết bộ phận nào liên lạc với bộ phận nào.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Static vs. Runtime-Enriched Map",
          vi: "Bản vẽ trên giấy vs. Bản đồ đã chạy thật",
        },
        description: {
          en: "Blue/purple lines come from reading code (Static). Solid emerald-green lines are 100% proven by real Runtime testing in Step 3.",
          vi: "Đường màu xanh dương/tím được đọc từ code (Tĩnh). Đường màu xanh ngọc đậm là những kết nối đã được chứng thực 100% khi chạy thử ở Step 3.",
        },
      },
      {
        badge: "2",
        title: {
          en: "3E Evidence Inspector",
          vi: "Kiểm tra Bằng chứng gốc (3E Inspector)",
        },
        description: {
          en: "Click any circle (service) or line (connection) on the map to open the right-hand panel showing the exact source file, line of code, or runtime trace.",
          vi: "Bấm vào bất kỳ hình tròn hay đường nối nào trên bản đồ để mở bảng bên phải, xem tận mắt dòng code hoặc băng ghi hình thực tế chứng minh kết nối đó.",
        },
      },
    ],
    steps: [
      {
        id: "arch-toolbar",
        selectors: ['[data-tour="architecture-toolbar"]', "main .rounded-xl"],
        title: {
          en: "1. Project & Model Revision Selector",
          vi: "1. Chọn Dự án & Phiên bản Kiến trúc (Revision)",
        },
        description: {
          en: "Pick which revision to view. Whenever available, choose the revision labeled '· Runtime-Enriched' (or click the green banner above) to see real runtime-verified calls.",
          vi: "Chọn phiên bản muốn xem. Hãy ưu tiên bản có chữ '· Runtime-Enriched' (hoặc bấm vào thanh thông báo màu xanh ngọc phía trên) để xem các kết nối đã chạy thực tế.",
        },
      },
      {
        id: "arch-controls",
        selectors: ['[data-tour="graph-controls"]', 'input[placeholder*="Search"]', "main"],
        title: {
          en: "2. Layout Mode, Search & Runtime Filter",
          vi: "2. Chế độ xem, Tìm kiếm & Lọc kết nối chạy thật",
        },
        description: {
          en: "Switch between Analysis and Explore layouts, search for a service by name, or click 'Filter Runtime Calls Only' to highlight only the emerald-green connections verified during runtime.",
          vi: "Chuyển đổi giữa chế độ Analysis và Explore, gõ tìm nhanh tên dịch vụ, hoặc bấm 'Filter Runtime Calls Only' để chỉ lọc riêng những đường màu xanh ngọc đã chạy thật.",
        },
      },
      {
        id: "arch-canvas",
        selectors: ['[data-tour="graph-canvas"]', "canvas", "main"],
        title: {
          en: "3. Interactive Network Canvas",
          vi: "3. Không gian Bản đồ Mạng lưới",
        },
        description: {
          en: "Drag nodes to rearrange, scroll to zoom, click any Service/Database node to inspect its internal components, or click any connecting arrow to see why two services are linked.",
          vi: "Kéo thả các nút để sắp xếp, cuộn chuột để phóng to/thu nhỏ, bấm vào một hình tròn để xem bên trong bộ phận đó có gì, hoặc bấm vào mũi tên nối để xem bằng chứng liên lạc.",
        },
      },
    ],
  },

  diagrams: {
    id: "diagrams",
    title: {
      en: "Architecture Diagrams (Draw.io) — Simple Guide",
      vi: "Sơ đồ Kiến trúc (Draw.io) — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Automatically converts your project into 9 international-standard C4 & UML technical diagrams ready for reports, theses, and presentations.",
      vi: "Tự động chuyển đổi dự án của bạn thành 9 loại sơ đồ chuẩn quốc tế (C4 & UML) trên bảng vẽ Draw.io để bạn chỉnh sửa và tải về làm báo cáo.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "9 Standard Diagram Types",
          vi: "9 Loại Sơ đồ Chuẩn Quốc tế",
        },
        description: {
          en: "Switch between C4 (Container, Component) and UML (Sequence, Class, Package, Deployment, Activity, State Machine) from the Diagram type dropdown.",
          vi: "Chuyển đổi linh hoạt giữa sơ đồ tổng thể (Container, Component, Deployment) và sơ đồ chi tiết (Sequence, Class, Package, Activity, State) ở ô Loại sơ đồ.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Observed Runtime Sequence & Export",
          vi: "Sơ đồ Trình tự Chạy thật & Xuất file",
        },
        description: {
          en: "In Sequence view, select 'Observed runtime' to see the real execution trace from Step 3, then click Download SVG, PDF, or .drawio.",
          vi: "Ở sơ đồ Sequence, chọn tab 'Observed runtime' để xem đúng trình tự gọi thật từ Step 3, sau đó bấm tải file SVG, PDF hoặc .drawio về máy.",
        },
      },
    ],
    steps: [
      {
        id: "diag-toolbar",
        selectors: ['[data-tour="architecture-toolbar"]', "main .rounded-xl"],
        title: {
          en: "1. Select Project & Runtime-Enriched Revision",
          vi: "1. Chọn Dự án & Phiên bản đã chạy Runtime",
        },
        description: {
          en: "Make sure the newest Runtime-Enriched revision is selected so your Sequence and Container diagrams include real runtime evidence.",
          vi: "Đảm bảo bạn đang chọn phiên bản '· Runtime-Enriched' mới nhất để các sơ đồ có đầy đủ dữ liệu từ lần chạy thử thực tế.",
        },
      },
      {
        id: "diag-type-selector",
        selectors: ['[data-tour="diagram-type-bar"]', "main select", "main"],
        title: {
          en: "2. Choose Diagram Type & Scope",
          vi: "2. Chọn Loại Sơ đồ & Phạm vi hiển thị",
        },
        description: {
          en: "Pick the diagram type you need (e.g., Container for overall system blocks, Sequence for step-by-step call order, Activity for business workflows, or Class for data structure).",
          vi: "Chọn loại sơ đồ bạn cần: Container (các khối dịch vụ lớn), Sequence (thứ tự gọi nhau theo thời gian), Activity (luồng nghiệp vụ), hoặc Class (cấu trúc dữ liệu).",
        },
      },
      {
        id: "diag-canvas",
        selectors: ['iframe[title*="draw.io"]', '[data-tour="diagram-canvas"]', "main svg", "main"],
        title: {
          en: "3. Interactive Diagram Canvas & Export Buttons",
          vi: "3. Bảng vẽ Sơ đồ & Các nút Tải về",
        },
        description: {
          en: "Zoom, fit to screen, click elements to inspect 3E source proof, or use Download SVG / Print PDF / Download .drawio to include the diagram in your document.",
          vi: "Phóng to/thu nhỏ, bấm vào từng ô để xem bằng chứng code, hoặc bấm Download SVG / Print PDF / Download .drawio để tải sơ đồ sắc nét về chèn vào báo cáo.",
        },
      },
    ],
  },

  model: {
    id: "model",
    title: {
      en: "Architecture Model Editor — Simple Guide",
      vi: "Trình chỉnh sửa Mô hình (Model Editor) — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Inspect, curate, add, or refine the list of services, components, databases, and connections in your architecture model.",
      vi: "Xem danh sách dạng bảng và tinh chỉnh trực tiếp các dịch vụ, thành phần, cơ sở dữ liệu hoặc đường kết nối trong mô hình kiến trúc.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Curate Elements & Relationships",
          vi: "Tinh chỉnh Thành phần & Kết nối",
        },
        description: {
          en: "Review every discovered element and connection. Add missing components, rename labels, or remove false-positive links.",
          vi: "Rà soát toàn bộ các bộ phận và đường kết nối mà máy đã tìm thấy. Bạn có thể đổi tên, thêm mới hoặc xóa các kết nối thừa.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Immutable Revision Saving",
          vi: "Lưu thành Phiên bản mới an toàn",
        },
        description: {
          en: "Saving your edits creates a brand-new Revision number so your original static analysis is never overwritten or lost.",
          vi: "Khi bấm Lưu, hệ thống tạo ra một số Phiên bản (Revision) mới tinh, giữ nguyên vẹn phiên bản gốc ban đầu để bạn luôn có thể quay lại.",
        },
      },
    ],
    steps: [
      {
        id: "model-selector",
        selectors: ["main select", "main"],
        title: {
          en: "1. Choose Baseline Revision",
          vi: "1. Chọn Phiên bản gốc cần chỉnh sửa",
        },
        description: {
          en: "Select the project and the model revision you want to inspect or edit.",
          vi: "Chọn dự án và phiên bản mô hình bạn muốn xem chi tiết hoặc chỉnh sửa.",
        },
      },
      {
        id: "model-elements",
        selectors: ["main section", "main table", "main"],
        title: {
          en: "2. Elements & Relationships Workspace",
          vi: "2. Danh sách các Bộ phận & Đường kết nối",
        },
        description: {
          en: "Browse services, components, and edges. Edit descriptions or add new architectural elements, then save as a new revision.",
          vi: "Duyệt qua danh sách các dịch vụ, thành phần và kết nối. Chỉnh sửa thông tin hoặc thêm phần tử mới, sau đó bấm Lưu thành phiên bản mới.",
        },
      },
    ],
  },

  compare: {
    id: "compare",
    title: {
      en: "Compare Model Versions — Simple Guide",
      vi: "So sánh các Phiên bản Kiến trúc — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Put two architecture revisions side by side to see exactly what services, components, or connections were added, removed, or verified by runtime.",
      vi: "Đặt 2 phiên bản kiến trúc cạnh nhau để xem chính xác có bộ phận hay đường kết nối nào mới thêm vào, bị xóa đi, hoặc vừa được chứng thực qua Runtime.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Static vs. Runtime Comparison",
          vi: "So sánh Bản tĩnh vs. Bản chạy thật",
        },
        description: {
          en: "Compare Revision 1 (Static) against Revision 2 (Runtime-Enriched) to see which connections were confirmed by live execution.",
          vi: "So sánh Revision 1 (Phân tích tĩnh) với Revision 2 (Runtime-Enriched) để thấy những đường kết nối nào đã được kiểm chứng thực tế.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Before vs. After Code Changes",
          vi: "So sánh Trước & Sau khi sửa code",
        },
        description: {
          en: "Compare an older snapshot revision with a newer snapshot revision to review architectural drift over time.",
          vi: "So sánh bản chụp cũ với bản chụp mới sau khi nhóm phát triển sửa code để biết kiến trúc hệ thống đã thay đổi như thế nào.",
        },
      },
    ],
    steps: [
      {
        id: "cmp-selectors",
        selectors: ["main .grid", "main select", "main"],
        title: {
          en: "1. Pick Base Revision & Target Revision",
          vi: "1. Chọn 2 Phiên bản cần đối chiếu",
        },
        description: {
          en: "Choose the older/baseline revision on the left and the newer/target revision on the right.",
          vi: "Chọn phiên bản gốc ở ô bên trái và phiên bản mới (hoặc bản Runtime-Enriched) ở ô bên phải.",
        },
      },
      {
        id: "cmp-diff",
        selectors: ["main section", "main table", "main"],
        title: {
          en: "2. Added, Removed & Modified Summary",
          vi: "2. Bảng tổng hợp các điểm Khác biệt",
        },
        description: {
          en: "Review the highlighted additions, removals, and changes across services, components, and communication links.",
          vi: "Xem chi tiết danh sách các dịch vụ, thành phần và đường kết nối được thêm mới (màu xanh), xóa bỏ (màu đỏ) hoặc thay đổi.",
        },
      },
    ],
  },

  impact: {
    id: "impact",
    title: {
      en: "Change Impact Analysis — Simple Guide",
      vi: "Phân tích Tác động Thay đổi (Change Impact) — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Answers the question: 'If I modify or shut down this service, which other parts of the system will break or be affected?'",
      vi: "Trả lời câu hỏi cực kỳ quan trọng: 'Nếu tôi sửa hoặc tắt bộ phận này, những bộ phận nào khác trong hệ thống sẽ bị ảnh hưởng dây chuyền?'",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Blast Radius Calculation",
          vi: "Tính toán Bán kính Ảnh hưởng",
        },
        description: {
          en: "Select any service or database to immediately see its Direct Impact, Indirect (multi-hop) Impact, and total Blast Radius.",
          vi: "Chọn một dịch vụ hoặc kho dữ liệu bất kỳ để biết ngay có bao nhiêu bộ phận bị ảnh hưởng trực tiếp, gián tiếp và tổng phạm vi rủi ro.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Upstream Callers vs. Downstream Dependencies",
          vi: "Ai gọi tôi (Upstream) vs. Tôi gọi ai (Downstream)",
        },
        description: {
          en: "Upstream shows who depends on the selected target; Downstream shows what the selected target relies on to function.",
          vi: "Bảng Upstream cho biết những ai đang phụ thuộc vào bộ phận này; bảng Downstream cho biết bộ phận này đang dựa vào những ai để hoạt động.",
        },
      },
    ],
    steps: [
      {
        id: "impact-target",
        selectors: ['[data-tour="impact-selectors"]', "main .grid", "main"],
        title: {
          en: "1. Choose Project, Revision & Target Element",
          vi: "1. Chọn Dự án, Phiên bản & Bộ phận muốn kiểm tra",
        },
        description: {
          en: "Pick a service, component, database, or queue from the searchable target selector (for example: catalog-service or order-service).",
          vi: "Chọn một dịch vụ, kho dữ liệu hoặc kênh tin nhắn bạn dự định thay đổi (ví dụ: catalog-service hoặc order-service).",
        },
      },
      {
        id: "impact-summary",
        selectors: ['[data-tour="impact-summary"]', "main article", "main"],
        title: {
          en: "2. Blast Radius Summary Cards",
          vi: "2. Các chỉ số Bán kính Rủi ro (Blast Radius)",
        },
        description: {
          en: "Check how many callers will be directly impacted (1 hop away) and how many will be affected indirectly through chain reactions.",
          vi: "Xem số lượng bộ phận bị ảnh hưởng trực tiếp (cách 1 bước gọi) và bị ảnh hưởng gián tiếp qua chuỗi dây chuyền nhiều chặng.",
        },
      },
      {
        id: "impact-paths",
        selectors: ['[data-tour="impact-paths"]', "main section", "main"],
        title: {
          en: "3. Upstream & Downstream Chain Paths",
          vi: "3. Chuỗi lan truyền Upstream & Downstream",
        },
        description: {
          en: "Inspect the exact hop-by-hop chain (e.g., api-gateway → order-service → catalog-service) and click any row to view its 3E evidence.",
          vi: "Xem chi tiết từng chặng lan truyền (ví dụ: api-gateway → order-service → catalog-service) và bấm vào từng dòng để xem bằng chứng kết nối.",
        },
      },
    ],
  },

  explain: {
    id: "explain",
    title: {
      en: "AI Explanations — Simple Guide",
      vi: "Giải thích Kiến trúc bằng AI — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Ask AI to explain any service, component, or connection in plain language, backed by real source code and runtime evidence from your project.",
      vi: "Nhờ AI giải thích vai trò và cách hoạt động của bất kỳ bộ phận hay đường kết nối nào bằng ngôn ngữ dễ hiểu, bám sát vào code thật của dự án.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Grounded in Real Evidence (No Guessing)",
          vi: "Bám sát Bằng chứng thật (Không suy đoán bừa)",
        },
        description: {
          en: "Every explanation cites the exact files, configuration keys, and runtime traces stored in your selected model revision.",
          vi: "Mọi lời giải thích của AI đều trích dẫn rõ lấy từ file code nào, cấu hình nào hoặc kết quả chạy Runtime nào của dự án.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Explain Elements or Connections",
          vi: "Giải thích Bộ phận hoặc Đường kết nối",
        },
        description: {
          en: "Filter by service or search by name, pick an item on the left, and generate a structured architectural explanation on the right.",
          vi: "Tìm và chọn một bộ phận hoặc một đường kết nối ở cột bên trái, sau đó xem bản giải thích chi tiết ở khung bên phải.",
        },
      },
    ],
    steps: [
      {
        id: "explain-selectors",
        selectors: ['[data-tour="explain-selectors"]', "main .grid", "main"],
        title: {
          en: "1. Select Project & Model Revision",
          vi: "1. Chọn Dự án & Phiên bản Kiến trúc",
        },
        description: {
          en: "Choose the project and revision you want AI to explain.",
          vi: "Chọn dự án và phiên bản mô hình mà bạn muốn AI phân tích, giải thích.",
        },
      },
      {
        id: "explain-target-list",
        selectors: ['[data-tour="explain-workspace"]', "main section", "main"],
        title: {
          en: "2. Pick a Service or Relationship & Generate Explanation",
          vi: "2. Chọn Bộ phận / Kết nối & Xem lời giải thích từ AI",
        },
        description: {
          en: "Select any element or connection from the list to read its responsibilities, dependencies, and supporting 3E evidence.",
          vi: "Bấm chọn một dịch vụ hoặc đường kết nối bất kỳ để đọc giải thích về nhiệm vụ, các phụ thuộc và bằng chứng code đi kèm.",
        },
      },
    ],
  },

  "runtime-config": {
    id: "runtime-config",
    title: {
      en: "Runtime Step 1: Configure Sandbox — Simple Guide",
      vi: "Runtime Bước 1: Chuẩn bị Phòng chạy thử — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Like inspecting a restaurant before opening: MAVIS checks how many services exist, prepares a safe isolated room (Sandbox), and lists all open API counters.",
      vi: "Giống như kiểm tra nhà hàng trước giờ mở cửa: MAVIS rà soát xem có bao nhiêu bộ phận cần bật, tự động lắp đặt phòng chạy thử an toàn và liệt kê mọi quầy giao dịch (API).",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Automatic Sandbox Preparation",
          vi: "Tự động chuẩn bị Phòng mô phỏng",
        },
        description: {
          en: "You don't need to know Docker or coding. MAVIS automatically fixes ports, injects safe sample passwords, and configures tracing cameras.",
          vi: "Bạn không cần biết kỹ thuật. Hệ thống tự động cấu hình cổng kết nối, điền sẵn mật khẩu mẫu an toàn và gắn camera theo dõi cho từng bộ phận.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Check Readiness → Proceed to Step 2",
          vi: "Kiểm tra Sẵn sàng → Sang Bước 2",
        },
        description: {
          en: "Verify that the revision status is Ready (green), review the discovered services and APIs, then click Next: Step 2 (Scenarios).",
          vi: "Khi thấy trạng thái báo Sẵn sàng (màu xanh), bạn chỉ cần bấm nút sang Bước 2 (Scenarios) để lên kịch bản cho khách hàng ảo chạy thử.",
        },
      },
    ],
    steps: [
      {
        id: "rc-stepper",
        selectors: ['[data-tour="runtime-stepper"]', "main .rounded-xl"],
        title: {
          en: "1. The 3-Step Runtime Journey",
          vi: "1. Lộ trình 3 bước Chạy thử Thực tế (Runtime)",
        },
        description: {
          en: "Step 1 prepares the sandbox room, Step 2 writes the test script for a virtual user, and Step 3 launches the software to record real interactions.",
          vi: "Bước 1: Chuẩn bị phòng mô phỏng → Bước 2: AI viết kịch bản cho khách hàng ảo → Bước 3: Bật phần mềm chạy thật và ghi hình kết quả.",
        },
      },
      {
        id: "rc-revision",
        selectors: ['[data-tour="runtime-target-revision"]', "main select", "main"],
        title: {
          en: "2. Target Revision & Check Button",
          vi: "2. Chọn Phiên bản & Kiểm tra độ sẵn sàng",
        },
        description: {
          en: "Select the code revision to test. MAVIS automatically scans its Docker Compose setup, services, databases, and REST API endpoints.",
          vi: "Chọn phiên bản dự án cần kiểm tra. MAVIS sẽ tự động rà soát danh sách các dịch vụ, cơ sở dữ liệu và toàn bộ các đầu mục giao dịch (API).",
        },
      },
      {
        id: "rc-services",
        selectors: ['[data-tour="runtime-detected-services"]', "main section", "main"],
        title: {
          en: "3. Discovered Services, APIs & Auto-Configured Environment",
          vi: "3. Danh sách Bộ phận, API & Cấu hình Tự động",
        },
        description: {
          en: "Review the runnable services (e.g., api-gateway, identity-service, catalog-service, order-service) and safe sample environment variables prepared for you.",
          vi: "Xem danh sách các bộ phận sẽ được bật lên (như Lễ tân, Thành viên, Kho hàng, Đơn hàng) cùng các thông số môi trường đã được điền sẵn an toàn.",
        },
      },
      {
        id: "rc-next",
        selectors: ['[data-tour="runtime-next-step2"]', 'a[href*="/scenarios"]', "main button"],
        title: {
          en: "4. Continue to Step 2 (Scenarios)",
          vi: "4. Chuyển sang Bước 2 (Lên kịch bản)",
        },
        description: {
          en: "Once preflight is ready, click 'Next: Step 2 (Scenarios) →' to let AI build your end-to-end test scenario.",
          vi: "Khi mọi thứ đã báo xanh, hãy bấm nút sang Bước 2 (Scenarios) để AI tự viết kịch bản đóng vai khách hàng đi mua sắm.",
        },
      },
    ],
  },

  scenarios: {
    id: "scenarios",
    title: {
      en: "Runtime Step 2: Test Scenarios — Simple Guide",
      vi: "Runtime Bước 2: Kịch bản Chạy thử — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "AI acts as a 'virtual customer' and writes a complete step-by-step shopping/usage script (Register → Login → Browse Catalog → Checkout Order → Payment).",
      vi: "Trí tuệ nhân tạo (AI) đóng vai một 'khách hàng ảo' và tự viết sẵn kịch bản trải nghiệm từ đầu đến cuối (Đăng ký → Đăng nhập → Xem hàng → Đặt đơn → Thanh toán).",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "4 Visual Business Flow Clusters",
          vi: "4 Cụm Công việc Nghiệp vụ trực quan",
        },
        description: {
          en: "Steps are grouped into 4 easy-to-read stages: 1. Auth & Identity → 2. Catalog & Inventory → 3. Order & Checkout → 4. Payment Verification.",
          vi: "Các bước được gom thành 4 cụm dễ hiểu: 1. Đăng ký/Đăng nhập → 2. Xem kho hàng & Mã giảm giá → 3. Điền địa chỉ & Đặt đơn → 4. Kiểm tra Thanh toán.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Automatic Variable Chaining",
          vi: "Bước sau tự nhớ kết quả của bước trước",
        },
        description: {
          en: "MAVIS automatically takes the login token (AUTH_TOKEN), product ID, and order ID from earlier steps and plugs them into later steps.",
          vi: "Hệ thống tự động lấy Thẻ đăng nhập (AUTH_TOKEN), Mã sản phẩm và Mã đơn hàng ở bước trước để điền tiếp vào các bước phía sau.",
        },
      },
    ],
    steps: [
      {
        id: "sc-header",
        selectors: ['[data-tour="scenario-header"]', "main .rounded-xl"],
        title: {
          en: "1. Scenario Name, Custom Focus & Regenerate",
          vi: "1. Tên kịch bản & Nút Tạo lại bằng AI (Regenerate)",
        },
        description: {
          en: "Review the AI-generated scenario summary, type a custom focus if you want to test a specific workflow, or click Regenerate for a fresh script.",
          vi: "Xem tóm tắt kịch bản do AI viết sẵn. Bạn có thể bấm Regenerate bất cứ lúc nào nếu muốn AI viết mới lại kịch bản theo chuẩn mới nhất.",
        },
      },
      {
        id: "sc-clusters",
        selectors: ['[data-tour="scenario-flow-clusters"]', "main section"],
        title: {
          en: "2. 4 Functional Clusters & One-Click Presets",
          vi: "2. Sơ đồ 4 Cụm Tính năng & Các nút Chọn nhanh (Presets)",
        },
        description: {
          en: "See how your API steps flow across the 4 business stages. Click 'Full End-to-End Flow' for the complete journey, or click a single cluster preset to test only that area.",
          vi: "Nhìn toàn cảnh 4 chặng nghiệp vụ. Bạn có thể bấm 'Full End-to-End Flow' để kiểm tra trọn gói, hoặc bấm từng nút nhỏ bên cạnh để chỉ kiểm tra riêng khu vực đó.",
        },
      },
      {
        id: "sc-steps",
        selectors: ['[data-tour="scenario-http-steps"]', "main"],
        title: {
          en: "3. Ordered HTTP Steps & Sample Data",
          vi: "3. Danh sách chi tiết từng bước thực hiện",
        },
        description: {
          en: "Each row is one action the virtual customer will take (e.g., #1 Register, #2 Login, #3 Fetch Categories/Products, #4 Create Coupon, #5 Checkout Order).",
          vi: "Mỗi dòng là một hành động cụ thể của khách hàng ảo (ví dụ: Bước #1 Đăng ký, Bước #2 Đăng nhập lấy thẻ, Bước #3 Xem danh mục/sản phẩm, Bước #4 Đặt mua hàng).",
        },
      },
      {
        id: "sc-confirm",
        selectors: ['[data-tour="scenario-confirm-run"]', "main button"],
        title: {
          en: "4. Confirm & Run in Step 3 →",
          vi: "4. Bấm Xác nhận & Chạy thật ở Bước 3 →",
        },
        description: {
          en: "Click 'Confirm & Run in Step 3 →' (top right) to save this scenario and launch the live sandbox execution.",
          vi: "Bấm nút 'Confirm & Run in Step 3 →' (góc phải trên) để lưu kịch bản này và chuyển sang Bước 3 mở cửa chạy thử thực tế.",
        },
      },
    ],
  },

  sessions: {
    id: "sessions",
    title: {
      en: "Runtime Step 3: Run & Trace — Simple Guide",
      vi: "Runtime Bước 3: Chạy thử & Xem kết quả — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "MAVIS boots up all microservices in a safe sandbox, runs your virtual customer script, and draws the real service topology and sequence diagram from live traces.",
      vi: "MAVIS khởi động toàn bộ phần mềm lên, cho khách hàng ảo chạy từng bước theo kịch bản, và vẽ lại sơ đồ các bộ phận gọi nhau từ băng ghi hình thực tế.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Isolate Any Business Flow Cluster",
          vi: "Soi chi tiết từng Cụm Tính năng",
        },
        description: {
          en: "Click 'Full End-to-End' to see the whole system, or click '1. Auth', '2. Catalog', '3. Order', or '4. Payment' to filter the Topology and Sequence Diagram.",
          vi: "Bấm 'Full End-to-End' để xem toàn cảnh, hoặc bấm vào từng ô (1. Auth, 2. Catalog, 3. Order, 4. Payment) để lọc riêng Bản đồ và Biểu đồ trình tự của cụm đó.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Open Runtime-Enriched Graph & Diagrams",
          vi: "Mở Bản đồ & Sơ đồ đã được Chứng thực",
        },
        description: {
          en: "When the session finishes, click 'Architecture Graph' or 'Architecture Diagrams' on the green banner to inspect the enriched architecture model.",
          vi: "Khi chạy xong, hãy bấm nút 'Architecture Graph' hoặc 'Architecture Diagrams' ở khung màu xanh ngọc để xem bản thiết kế đã được đóng dấu thực tế.",
        },
      },
    ],
    steps: [
      {
        id: "sess-launch",
        selectors: ['[data-tour="session-launch-bar"]', "main .rounded-xl"],
        title: {
          en: "1. Start Runtime Verification & Session Status",
          vi: "1. Khởi chạy Phiên kiểm thử & Theo dõi Trạng thái",
        },
        description: {
          en: "Click 'Start Runtime Verification' to boot the containers and execute the scenario. You can also switch between past sessions in the history list.",
          vi: "Bấm nút bắt đầu để hệ thống bật các bộ phận lên và chạy kịch bản. Bạn cũng có thể chọn xem lại kết quả của các lần chạy trước đó.",
        },
      },
      {
        id: "sess-clusters",
        selectors: ['[data-tour="session-flow-clusters"]', "main section"],
        title: {
          en: "2. Interactive Feature Flow Filter Tabs",
          vi: "2. Thanh lọc theo 4 Cụm Tính năng Nghiệp vụ",
        },
        description: {
          en: "Click any of the 4 functional cluster cards to isolate just the services and calls involved in that stage, or keep 'Full End-to-End' selected.",
          vi: "Bấm vào bất kỳ ô nào trong 4 cụm tính năng để chỉ xem riêng các bộ phận và cuộc gọi của chặng đó, hoặc chọn 'Full End-to-End' để xem tất cả.",
        },
      },
      {
        id: "sess-topology",
        selectors: ['[data-tour="session-topology"]', "main svg", "main"],
        title: {
          en: "3. Observed Service Call Topology",
          vi: "3. Bản đồ các Bộ phận đã Thực sự Gọi nhau (Topology)",
        },
        description: {
          en: "Shows the exact microservices that communicated during the test run. Drag nodes to rearrange or click a service node to filter the calls below.",
          vi: "Hiển thị chính xác những bộ phận nào đã nói chuyện với nhau khi khách hàng ảo đi mua hàng (ví dụ: Lễ tân gọi Thành viên, Đơn hàng gọi Kho hàng).",
        },
      },
      {
        id: "sess-sequence",
        selectors: ['[data-tour="session-sequence"]', "main"],
        title: {
          en: "4. UML 2.5.1 Runtime Sequence Diagram & Step Verification",
          vi: "4. Biểu đồ Trình tự Thời gian (Sequence) & Kết quả từng bước",
        },
        description: {
          en: "Read from top to bottom to see the exact call order, response status (green 200/201), and response time in milliseconds, then click Architecture Graph / Diagrams below.",
          vi: "Đọc từ trên xuống dưới để thấy thứ tự ai gọi ai trước, mã phản hồi (màu xanh 200/201 là thành công) và thời gian xử lý, sau đó bấm mở Graph / Diagrams ở cuối trang.",
        },
      },
    ],
  },

  workspaces: {
    id: "workspaces",
    title: {
      en: "My Workspaces — Simple Guide",
      vi: "Không gian Lớp học (Workspaces) — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Join a class workspace using an invitation code from your lecturer, or create and manage class workspaces for coursework assignments.",
      vi: "Tham gia vào lớp học bằng mã mời của giảng viên, hoặc tạo và quản lý các lớp học để giao và nộp bài tập kiến trúc phần mềm.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "For Students: Join & Submit Coursework",
          vi: "Dành cho Sinh viên: Tham gia lớp & Làm bài tập",
        },
        description: {
          en: "Enter your class join code, open the class workspace, view assignments, and submit your analyzed project revision.",
          vi: "Nhập mã lớp học do giảng viên cung cấp, mở vào lớp để xem đề bài và nộp mô hình kiến trúc dự án của bạn.",
        },
      },
      {
        badge: "2",
        title: {
          en: "For Lecturers: Create Classes & Assignments",
          vi: "Dành cho Giảng viên: Tạo lớp & Giao bài tập",
        },
        description: {
          en: "Create a class workspace, share the join code with students, publish assignments, and grade frozen student submissions.",
          vi: "Tạo không gian lớp học mới, chia sẻ mã tham gia cho sinh viên, đăng bài tập và chấm điểm trên bản nộp đóng băng của sinh viên.",
        },
      },
    ],
    steps: [
      {
        id: "ws-actions",
        selectors: ["main button", "main"],
        title: {
          en: "1. Join or Create a Class Workspace",
          vi: "1. Tham gia Lớp học hoặc Tạo Lớp mới",
        },
        description: {
          en: "Students can join a class using a Workspace Code; lecturers can create a new class workspace for their course.",
          vi: "Sinh viên dùng Mã lớp (Join Code) để vào lớp; Giảng viên có thể tạo một lớp học mới cho môn học của mình.",
        },
      },
      {
        id: "ws-list",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "2. Open Your Class Workspace",
          vi: "2. Danh sách các Lớp học của bạn",
        },
        description: {
          en: "Click any workspace row or name to open its Class Overview, Assignments, Members, and Submissions.",
          vi: "Bấm vào tên lớp học bất kỳ để mở trang Tổng quan lớp, Danh sách bài tập, Thành viên và Bài nộp.",
        },
      },
    ],
  },

  "workspace-overview": {
    id: "workspace-overview",
    title: {
      en: "Workspace Overview — Simple Guide",
      vi: "Tổng quan Lớp học — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "View class details, member counts, active assignments, and quick links to coursework and submissions.",
      vi: "Xem thông tin chung của lớp học, mã tham gia lớp, số lượng thành viên và danh sách các bài tập đang mở.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Class Info & Join Code",
          vi: "Thông tin Lớp & Mã tham gia",
        },
        description: {
          en: "Check the class code, lecturer information, and overall activity counters.",
          vi: "Xem mã lớp học, thông tin giảng viên phụ trách và các con số thống kê chung của lớp.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Navigate to Assignments",
          vi: "Chuyển nhanh sang phần Bài tập",
        },
        description: {
          en: "Use the left sidebar or quick action buttons to open Assignments & Submit.",
          vi: "Dùng thanh menu bên trái hoặc các nút lối tắt để mở mục Bài tập & Nộp bài.",
        },
      },
    ],
    steps: [
      {
        id: "wo-selector",
        selectors: ["main select", "main"],
        title: {
          en: "1. Active Workspace Selector",
          vi: "1. Chọn Lớp học đang xem",
        },
        description: {
          en: "Switch between the class workspaces you belong to.",
          vi: "Chuyển đổi nhanh giữa các lớp học mà bạn đang tham gia hoặc giảng dạy.",
        },
      },
      {
        id: "wo-summary",
        selectors: ["main section", "main article", "main"],
        title: {
          en: "2. Class Summary & Quick Actions",
          vi: "2. Thống kê Lớp học & Lối tắt",
        },
        description: {
          en: "Review active assignments, member roster counts, and jump straight to coursework tasks.",
          vi: "Xem số lượng bài tập đang mở, sĩ số lớp và bấm chuyển thẳng tới trang làm bài tập.",
        },
      },
    ],
  },

  assignments: {
    id: "assignments",
    title: {
      en: "Assignments & Submit — Simple Guide",
      vi: "Bài tập & Nộp bài — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Read assignment requirements, create or link your coursework project, check submission readiness, and submit your architecture model for grading.",
      vi: "Xem đề bài của giảng viên, tạo dự án làm bài, kiểm tra đủ điều kiện theo yêu cầu và bấm nộp bài để giảng viên chấm điểm.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Work on Your Assignment Project",
          vi: "Tạo & Phân tích Dự án Bài tập",
        },
        description: {
          en: "Start a coursework project from the assignment card, analyze its code and runtime, then return here to submit.",
          vi: "Khởi tạo dự án bài tập ngay từ thẻ đề bài, chạy phân tích tĩnh và Runtime, sau đó quay lại đây để nộp.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Readiness Check & Frozen Submission",
          vi: "Kiểm tra điều kiện & Đóng băng bài nộp",
        },
        description: {
          en: "MAVIS checks if you met all required diagrams/evidence before freezing your selected revision for the lecturer.",
          vi: "Hệ thống tự kiểm tra xem bài của bạn đã đủ các sơ đồ/bằng chứng theo yêu cầu chưa trước khi đóng gói gửi giảng viên.",
        },
      },
    ],
    steps: [
      {
        id: "asg-list",
        selectors: ["main section", "main article", "main"],
        title: {
          en: "1. Assignment Cards & Requirements",
          vi: "1. Danh sách Đề bài & Yêu cầu cần đạt",
        },
        description: {
          en: "Each assignment shows its due date, instructions, required architecture artifacts, and current submission status.",
          vi: "Mỗi bài tập hiển thị rõ hạn nộp, hướng dẫn của giảng viên, các sơ đồ bắt buộc phải có và trạng thái nộp bài hiện tại.",
        },
      },
      {
        id: "asg-submit",
        selectors: ["main button", "main"],
        title: {
          en: "2. Open Coursework Project or Submit Model",
          vi: "2. Mở Dự án Làm bài hoặc Bấm Nộp bài",
        },
        description: {
          en: "Click to open your linked project workspace, or select your best Model Revision and click Submit when ready.",
          vi: "Bấm để mở dự án làm bài của bạn, hoặc chọn Phiên bản Kiến trúc (Revision) tốt nhất rồi bấm Nộp bài (Submit).",
        },
      },
    ],
  },

  members: {
    id: "members",
    title: {
      en: "Workspace Members — Simple Guide",
      vi: "Thành viên Lớp học — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "View the list of lecturers and students enrolled in the selected class workspace.",
      vi: "Xem danh sách giảng viên và sinh viên đang tham gia trong lớp học này.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Class Roster & Roles",
          vi: "Danh sách lớp & Vai trò",
        },
        description: {
          en: "See every participant's name, email, role (Lecturer / Student), and enrollment status.",
          vi: "Xem tên, email và vai trò (Giảng viên / Sinh viên) của từng thành viên trong lớp.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Member Management (Lecturers)",
          vi: "Quản lý thành viên (Dành cho Giảng viên)",
        },
        description: {
          en: "Lecturers can invite new students, copy the class join code, or remove members if needed.",
          vi: "Giảng viên có thể mời thêm sinh viên, sao chép mã vào lớp hoặc quản lý danh sách sinh viên.",
        },
      },
    ],
    steps: [
      {
        id: "mem-table",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "1. Enrolled Members Directory",
          vi: "1. Bảng danh sách Thành viên trong lớp",
        },
        description: {
          en: "Search or browse the members currently enrolled in this workspace.",
          vi: "Tìm kiếm hoặc xem danh sách các thành viên hiện có trong không gian lớp học.",
        },
      },
    ],
  },

  references: {
    id: "references",
    title: {
      en: "Reference Source Versions — Simple Guide",
      vi: "Phiên bản Mã nguồn Tham chiếu — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Standard starter repositories and pinned commits curated by lecturers for class assignments.",
      vi: "Danh sách các kho mã nguồn mẫu và phiên bản chuẩn do giảng viên thiết lập sẵn cho bài tập trong lớp.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Pinned Starter Repositories",
          vi: "Kho mã nguồn mẫu cố định",
        },
        description: {
          en: "Ensures every student starts from the exact same GitHub repository branch and commit.",
          vi: "Giúp mọi sinh viên trong lớp cùng làm bài trên một phiên bản mã nguồn chuẩn thống nhất.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Linked to Class Assignments",
          vi: "Gắn trực tiếp vào Bài tập",
        },
        description: {
          en: "Reference versions can be attached to assignments so students can import them with one click.",
          vi: "Giảng viên gắn phiên bản mẫu này vào đề bài để sinh viên chỉ cần bấm 1 nút là khởi tạo xong dự án.",
        },
      },
    ],
    steps: [
      {
        id: "ref-list",
        selectors: ["main section", "main table", "main"],
        title: {
          en: "1. Reference Repositories List",
          vi: "1. Danh sách Phiên bản Mã nguồn Chuẩn",
        },
        description: {
          en: "Review or register pinned GitHub repositories and commit SHAs for coursework.",
          vi: "Xem hoặc thêm mới các kho mã nguồn GitHub chuẩn phục vụ cho bài tập môn học.",
        },
      },
    ],
  },

  submissions: {
    id: "submissions",
    title: {
      en: "Submissions — Simple Guide",
      vi: "Danh sách Bài nộp — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Track your submitted coursework revisions, review grades and lecturer feedback, or (for lecturers) inspect and grade student submissions.",
      vi: "Theo dõi các bài tập bạn đã nộp, xem điểm số và nhận xét của giảng viên (hoặc dành cho giảng viên vào chấm bài).",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Immutable Frozen Submissions",
          vi: "Bài nộp được Đóng băng an toàn",
        },
        description: {
          en: "When you submit, MAVIS freezes a read-only copy of your graph, diagrams, and runtime evidence at that exact moment.",
          vi: "Khi nộp bài, hệ thống lưu đóng băng toàn bộ bản đồ, sơ đồ và kết quả chạy thử tại đúng thời điểm nộp để chấm điểm công bằng.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Grades & Detailed Review",
          vi: "Xem điểm & Chi tiết Nhận xét",
        },
        description: {
          en: "Click any submission row to open the full Submission Review workspace.",
          vi: "Bấm vào bất kỳ dòng bài nộp nào để mở màn hình xem chi tiết bài làm và nhận xét của giảng viên.",
        },
      },
    ],
    steps: [
      {
        id: "sub-table",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "1. Submissions List & Status",
          vi: "1. Bảng danh sách Bài nộp & Trạng thái chấm",
        },
        description: {
          en: "Filter submissions by class or status, and click Open/Review on any row to inspect the frozen architecture artifacts.",
          vi: "Xem trạng thái bài nộp (Đã nộp, Đã chấm điểm) và bấm vào từng bài để mở xem toàn bộ hồ sơ kiến trúc đã nộp.",
        },
      },
    ],
  },

  "submission-review": {
    id: "submission-review",
    title: {
      en: "Submission Details & Review — Simple Guide",
      vi: "Chi tiết Bài nộp & Chấm điểm — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Inspect the frozen snapshot, architecture graph, diagrams, runtime evidence, and grading feedback for a submitted assignment.",
      vi: "Xem lại nguyên vẹn bản chụp mã nguồn, bản đồ kiến trúc, sơ đồ, bằng chứng chạy thử Runtime và bảng chấm điểm của bài nộp.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Frozen Architecture Artifacts",
          vi: "Hồ sơ Kiến trúc Đóng băng",
        },
        description: {
          en: "Switch tabs to inspect the submitted Graph, Diagrams, and Runtime traces exactly as they were when submitted.",
          vi: "Chuyển qua lại giữa các tab để xem Bản đồ, Sơ đồ và kết quả Runtime đúng như lúc sinh viên bấm nộp.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Score & Lecturer Feedback",
          vi: "Điểm số & Nhận xét từ Giảng viên",
        },
        description: {
          en: "Lecturers record draft scores and publish feedback; students view their published grade and comments here.",
          vi: "Giảng viên nhập điểm và công bố nhận xét; sinh viên xem điểm chính thức và lời khuyên sửa bài tại đây.",
        },
      },
    ],
    steps: [
      {
        id: "sr-artifacts",
        selectors: ["main section", "main"],
        title: {
          en: "1. Submitted Architecture & Runtime Evidence",
          vi: "1. Xem Hồ sơ Kiến trúc & Bằng chứng Runtime đã nộp",
        },
        description: {
          en: "Explore the read-only architecture graph, C4/UML diagrams, and runtime execution results attached to this submission.",
          vi: "Kiểm tra chi tiết bản đồ kiến trúc, các sơ đồ C4/UML và bằng chứng chạy thử được đính kèm trong bài nộp này.",
        },
      },
      {
        id: "sr-grading",
        selectors: ["main form", "main aside", "main"],
        title: {
          en: "2. Evaluation & Grading Panel",
          vi: "2. Khung Đánh giá, Điểm số & Nhận xét",
        },
        description: {
          en: "Review the rubric score and written feedback (or save/publish grades if you are the lecturer).",
          vi: "Xem điểm số và nhận xét chi tiết cho bài nộp (hoặc nhập điểm và công bố kết quả nếu bạn là giảng viên).",
        },
      },
    ],
  },

  health: {
    id: "health",
    title: {
      en: "System Health — Admin Guide",
      vi: "Sức khỏe Hệ thống — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Monitor live connectivity and readiness across the Backend API, PostgreSQL database, Worker nodes, and container runtime.",
      vi: "Giám sát trực tiếp trạng thái hoạt động của máy chủ Backend, cơ sở dữ liệu PostgreSQL, máy trạm Worker và môi trường chạy container.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Component Status Indicators",
          vi: "Đèn báo trạng thái từng bộ phận",
        },
        description: {
          en: "Verify that database, worker queue, and external integrations are healthy and responsive.",
          vi: "Kiểm tra xem cơ sở dữ liệu, hàng đợi xử lý và các dịch vụ kết nối bên ngoài có đang hoạt động tốt không.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Live Refresh & Diagnostics",
          vi: "Làm mới & Chẩn đoán sự cố",
        },
        description: {
          en: "Trigger an immediate health probe whenever you deploy an update or investigate an outage.",
          vi: "Bấm làm mới để kiểm tra tức thời ngay sau khi nâng cấp hệ thống hoặc khi cần kiểm tra đường truyền.",
        },
      },
    ],
    steps: [
      {
        id: "adm-health-cards",
        selectors: ["main .grid", "main section", "main"],
        title: {
          en: "1. Service & Infrastructure Health Cards",
          vi: "1. Bảng trạng thái Máy chủ & Hạ tầng",
        },
        description: {
          en: "Check uptime, database connectivity, and worker readiness indicators across the platform.",
          vi: "Xem trạng thái kết nối Database, bộ nhớ máy chủ và tình trạng sẵn sàng của các Worker.",
        },
      },
    ],
  },

  jobs: {
    id: "jobs",
    title: {
      en: "Analysis Jobs — Admin Guide",
      vi: "Quản lý Tác vụ Phân tích — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Inspect, filter, retry, or review all static source analysis jobs across every user and project on the platform.",
      vi: "Theo dõi, tìm kiếm, thử lại hoặc kiểm tra kết quả của toàn bộ các lượt quét mã nguồn trên hệ thống.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Platform-Wide Job Queue",
          vi: "Danh sách Tác vụ toàn hệ thống",
        },
        description: {
          en: "Filter jobs by status (Completed, Processing, Failed) or search by project/repository name.",
          vi: "Lọc các lượt phân tích theo trạng thái (Hoàn tất, Đang chạy, Lỗi) hoặc tìm theo tên dự án.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Inspect Generated Architecture",
          vi: "Kiểm tra Mô hình Kiến trúc sinh ra",
        },
        description: {
          en: "Click any job to inspect its summary metrics and jump directly into its Graph Explorer or Diagrams.",
          vi: "Bấm vào một tác vụ bất kỳ để xem số liệu thống kê và mở kiểm tra trực tiếp Bản đồ hoặc Sơ đồ của dự án đó.",
        },
      },
    ],
    steps: [
      {
        id: "adm-jobs-table",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "1. Search, Filter & Inspect Analysis Jobs",
          vi: "1. Tìm kiếm, Lọc & Kiểm tra chi tiết Tác vụ",
        },
        description: {
          en: "Use the search bar and status filter to locate any analysis run, then click a row to inspect its generated model.",
          vi: "Dùng ô tìm kiếm và bộ lọc trạng thái để tra cứu tác vụ, sau đó bấm vào dòng tương ứng để xem chi tiết mô hình.",
        },
      },
    ],
  },

  usage: {
    id: "usage",
    title: {
      en: "Platform Usage — Admin Guide",
      vi: "Thống kê Sử dụng Hệ thống — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Track AI token consumption, analysis volume, active projects, and quota usage across the platform.",
      vi: "Theo dõi lưu lượng sử dụng AI (token), số lượt phân tích, số dự án hoạt động và hạn mức tài nguyên trên toàn nền tảng.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "AI Token & Request Metrics",
          vi: "Lưu lượng gọi AI & Token tiêu thụ",
        },
        description: {
          en: "Monitor prompt/completion tokens and cost efficiency across AI explanations and runtime scenario generation.",
          vi: "Giám sát lượng token AI đã dùng cho tính năng Giải thích kiến trúc và Tự động dựng kịch bản Runtime.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Platform Growth & Activity",
          vi: "Tăng trưởng Dự án & Người dùng",
        },
        description: {
          en: "Review aggregate usage trends to plan server capacity and API quotas.",
          vi: "Xem xu hướng sử dụng theo thời gian để cân đối tài nguyên máy chủ và hạn mức API.",
        },
      },
    ],
    steps: [
      {
        id: "adm-usage-cards",
        selectors: ["main .grid", "main section", "main"],
        title: {
          en: "1. AI & Platform Usage Metrics",
          vi: "1. Bảng chỉ số Sử dụng AI & Tài nguyên",
        },
        description: {
          en: "Review real-time token counters, request success rates, and project activity summaries.",
          vi: "Xem thống kê số lượng token, tỷ lệ gọi thành công và mức độ hoạt động của các dự án.",
        },
      },
    ],
  },

  users: {
    id: "users",
    title: {
      en: "User Account List — Admin Guide",
      vi: "Quản lý Tài khoản Người dùng — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Manage student, lecturer, and administrator accounts, roles, and access status.",
      vi: "Quản lý danh sách tài khoản sinh viên, giảng viên và quản trị viên, phân quyền và kiểm soát trạng thái truy cập.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Role & Permission Assignment",
          vi: "Phân quyền Vai trò (Student / Lecturer / Admin)",
        },
        description: {
          en: "Promote lecturers or administrators and verify user account statuses.",
          vi: "Cấp quyền Giảng viên hoặc Quản trị viên và kiểm tra trạng thái kích hoạt của từng tài khoản.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Account Search & Filtering",
          vi: "Tìm kiếm & Lọc tài khoản nhanh",
        },
        description: {
          en: "Find users by name, email address, or assigned role.",
          vi: "Tra cứu nhanh người dùng theo họ tên, địa chỉ email hoặc vai trò trên hệ thống.",
        },
      },
    ],
    steps: [
      {
        id: "adm-users-table",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "1. User Accounts Directory",
          vi: "1. Bảng danh sách Tài khoản Người dùng",
        },
        description: {
          en: "Search users, inspect their roles, and update account permissions or status as needed.",
          vi: "Tìm kiếm người dùng, kiểm tra vai trò hiện tại và cập nhật quyền hạn hoặc trạng thái tài khoản.",
        },
      },
    ],
  },

  integrations: {
    id: "integrations",
    title: {
      en: "Integration Management — Admin Guide",
      vi: "Quản lý Tích hợp — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Configure and verify external service connections such as GitHub APIs, AI LLM providers, and diagram rendering engines.",
      vi: "Cấu hình và kiểm tra kết nối tới các dịch vụ bên ngoài như GitHub, nhà cung cấp AI (OpenAI/Gemini) và bộ vẽ sơ đồ Draw.io.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "AI & GitHub Credentials",
          vi: "Khóa kết nối AI & GitHub",
        },
        description: {
          en: "Manage API keys and endpoint configurations for AI scenario synthesis and repository fetching.",
          vi: "Quản lý khóa API và địa chỉ kết nối phục vụ việc tải mã nguồn GitHub và sinh kịch bản AI.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Connection Health Verification",
          vi: "Kiểm tra Trạng thái Kết nối",
        },
        description: {
          en: "Verify that each external integration is reachable and properly authenticated.",
          vi: "Đảm bảo mọi tích hợp bên ngoài đều đang thông suốt và xác thực hợp lệ.",
        },
      },
    ],
    steps: [
      {
        id: "adm-integrations",
        selectors: ["main section", "main"],
        title: {
          en: "1. External Integrations Panel",
          vi: "1. Bảng cấu hình các Kết nối Tích hợp",
        },
        description: {
          en: "Inspect and update integration settings for AI providers, GitHub, and runtime telemetry.",
          vi: "Kiểm tra và cập nhật thông số kết nối cho AI, GitHub và hệ thống thu thập dữ liệu Runtime.",
        },
      },
    ],
  },

  audit: {
    id: "audit",
    title: {
      en: "Audit Records — Admin Guide",
      vi: "Nhật ký Kiểm toán (Audit Records) — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Immutable security and operational audit trail of administrative changes, deletions, and sensitive actions.",
      vi: "Sổ nhật ký bảo mật ghi lại toàn bộ các thao tác quản trị, xóa dữ liệu và thay đổi cấu hình quan trọng trên hệ thống.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Who Did What & When",
          vi: "Ai đã làm gì và vào lúc nào",
        },
        description: {
          en: "Every administrative action and resource deletion is recorded with actor, target resource, and timestamp.",
          vi: "Mọi thao tác quản trị và xóa tài nguyên đều được ghi nhận rõ người thực hiện, đối tượng tác động và thời gian.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Compliance & Troubleshooting",
          vi: "Tra cứu & Đối soát an toàn",
        },
        description: {
          en: "Filter audit records to investigate configuration changes or resource lifecycle events.",
          vi: "Lọc nhật ký để tra cứu lịch sử thay đổi cấu hình hoặc kiểm tra các sự kiện vận hành.",
        },
      },
    ],
    steps: [
      {
        id: "adm-audit-table",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "1. Security & Activity Audit Log",
          vi: "1. Bảng Nhật ký Kiểm toán & Bảo mật",
        },
        description: {
          en: "Browse chronological audit events across users, projects, and system settings.",
          vi: "Duyệt xem danh sách các sự kiện bảo mật và thao tác quản trị theo trình tự thời gian.",
        },
      },
    ],
  },

  "runtime-summary": {
    id: "runtime-summary",
    title: {
      en: "Runtime Summary — Admin Guide",
      vi: "Tổng quan Runtime — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Overview of active sandbox runtime sessions, worker capacity, and container resource utilization.",
      vi: "Tổng quan về các phiên chạy thử Sandbox đang hoạt động, năng lực xử lý của Worker và mức sử dụng tài nguyên.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Active Sandbox Monitoring",
          vi: "Giám sát Phòng chạy thử đang mở",
        },
        description: {
          en: "See how many runtime sessions are currently running, queued, or completed.",
          vi: "Xem có bao nhiêu phiên chạy thử đang diễn ra, đang xếp hàng hoặc đã hoàn tất.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Resource Recovery Controls",
          vi: "Thu hồi Tài nguyên & Xử lý phiên treo",
        },
        description: {
          en: "Clean up stale containers or inspect worker dispatch status.",
          vi: "Dọn dẹp các container chạy quá hạn và kiểm tra trạng thái điều phối của Worker.",
        },
      },
    ],
    steps: [
      {
        id: "adm-rt-summary",
        selectors: ["main .grid", "main section", "main"],
        title: {
          en: "1. Runtime Capacity & Session Counters",
          vi: "1. Chỉ số Năng lực Runtime & Số phiên chạy",
        },
        description: {
          en: "Monitor sandbox execution health and navigate to Execution Profiles or Runtime Sessions.",
          vi: "Theo dõi tình trạng hoạt động của hệ thống Sandbox và chuyển nhanh sang quản lý Cấu hình hoặc Phiên chạy.",
        },
      },
    ],
  },

  profiles: {
    id: "profiles",
    title: {
      en: "Runtime Execution Profiles — Admin Guide",
      vi: "Cấu hình Tài nguyên Runtime (Profiles) — Hướng dẫn Quản trị",
    },
    subtitle: {
      en: "Define CPU, RAM, timeout, and network isolation limits for sandbox runtime executions.",
      vi: "Thiết lập giới hạn CPU, bộ nhớ RAM, thời gian chạy tối đa và chế độ cách ly mạng cho các phòng chạy thử Sandbox.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Safe Resource Boundaries",
          vi: "Giới hạn Tài nguyên An toàn",
        },
        description: {
          en: "Prevent runaway projects from exhausting server memory or CPU during runtime tests.",
          vi: "Đảm bảo mỗi dự án chạy thử chỉ sử dụng trong phạm vi RAM/CPU cho phép, không làm ảnh hưởng người dùng khác.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Enable or Disable Profiles",
          vi: "Bật / Tắt các Gói cấu hình",
        },
        description: {
          en: "Update execution limits or temporarily pause new runs on specific profiles.",
          vi: "Điều chỉnh thông số giới hạn hoặc tạm khóa khởi tạo phiên chạy mới khi bảo trì.",
        },
      },
    ],
    steps: [
      {
        id: "adm-profiles",
        selectors: ["main table", "main section", "main"],
        title: {
          en: "1. Execution Profiles & Resource Limits",
          vi: "1. Danh sách Gói cấu hình & Giới hạn Tài nguyên",
        },
        description: {
          en: "Review and configure CPU, memory, and timeout limits for runtime sandbox sessions.",
          vi: "Xem và tinh chỉnh giới hạn CPU, RAM và thời gian chờ tối đa cho các phiên chạy thử.",
        },
      },
    ],
  },

  "admin-sessions": {
    id: "admin-sessions",
    title: {
      en: "Admin Runtime Sessions — Guide",
      vi: "Quản trị Phiên chạy Runtime — Hướng dẫn",
    },
    subtitle: {
      en: "Monitor and manage all runtime verification sessions across the platform.",
      vi: "Giám sát và quản lý toàn bộ các phiên chạy kiểm thử Runtime của mọi dự án trên hệ thống.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Inspect Any Runtime Session",
          vi: "Kiểm tra mọi Phiên chạy trên hệ thống",
        },
        description: {
          en: "View execution steps, container logs, and OpenTelemetry traces for any session.",
          vi: "Xem chi tiết các bước chạy, nhật ký container và kết quả thu thập dữ liệu của bất kỳ phiên nào.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Force Stop or Cleanup",
          vi: "Dừng khẩn cấp hoặc Thu hồi tài nguyên",
        },
        description: {
          en: "Terminate stuck sessions to free worker capacity immediately.",
          vi: "Dừng các phiên chạy bị treo để giải phóng tài nguyên máy chủ ngay lập tức.",
        },
      },
    ],
    steps: [
      {
        id: "adm-sessions-list",
        selectors: ["main section", "main"],
        title: {
          en: "1. Platform Runtime Sessions Monitor",
          vi: "1. Bảng giám sát các Phiên chạy Runtime",
        },
        description: {
          en: "Inspect active and historical runtime sessions across all projects.",
          vi: "Theo dõi các phiên chạy đang diễn ra và lịch sử chạy trước đó trên toàn hệ thống.",
        },
      },
    ],
  },

  profile: {
    id: "profile",
    title: {
      en: "My Profile — Simple Guide",
      vi: "Hồ sơ Cá nhân — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "View your account summary statistics, update your display name, and manage your password security.",
      vi: "Xem thống kê hoạt động tài khoản của bạn, cập nhật họ tên hiển thị và đổi mật khẩu bảo mật.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Personal Info & Activity Counters",
          vi: "Thông tin Cá nhân & Thống kê Hoạt động",
        },
        description: {
          en: "Check your role, email, project count, and update your full name anytime.",
          vi: "Xem vai trò tài khoản, email, tổng số dự án đã tạo và cập nhật tên hiển thị của bạn.",
        },
      },
      {
        badge: "2",
        title: {
          en: "Account Password Security",
          vi: "Đổi mật khẩu Bảo mật",
        },
        description: {
          en: "Change your password safely using the dedicated Account Security form.",
          vi: "Thay đổi mật khẩu đăng nhập an toàn ngay tại khung Bảo mật tài khoản bên dưới.",
        },
      },
    ],
    steps: [
      {
        id: "prof-summary",
        selectors: ['section[aria-label*="Profile"]', 'section[aria-label*="Hồ sơ"]', "main section"],
        title: {
          en: "1. Account Summary & Statistics",
          vi: "1. Tóm tắt Tài khoản & Số liệu thống kê",
        },
        description: {
          en: "Shows your current role, email address, and total projects, services, workspaces, and submissions.",
          vi: "Hiển thị vai trò, email của bạn cùng tổng số dự án, dịch vụ, lớp học và bài nộp.",
        },
      },
      {
        id: "prof-info",
        selectors: ["#profile-full-name", "main form"],
        title: {
          en: "2. Update Personal Display Name",
          vi: "2. Cập nhật Họ và tên hiển thị",
        },
        description: {
          en: "Edit your full name and click Save Changes to update how your name appears across projects and classes.",
          vi: "Nhập tên mới và bấm Lưu thay đổi để cập nhật tên hiển thị của bạn trong các dự án và lớp học.",
        },
      },
      {
        id: "prof-security",
        selectors: ["#current-password", "main form:last-of-type"],
        title: {
          en: "3. Change Account Password",
          vi: "3. Đổi mật khẩu bảo mật",
        },
        description: {
          en: "Enter your current password and a new strong password to keep your account secure.",
          vi: "Nhập mật khẩu hiện tại và mật khẩu mới để bảo vệ an toàn cho tài khoản của bạn.",
        },
      },
    ],
  },

  notifications: {
    id: "notifications",
    title: {
      en: "Notifications — Simple Guide",
      vi: "Hộp thư Thông báo — Hướng dẫn đơn giản",
    },
    subtitle: {
      en: "Stay updated when your static code scans finish, runtime sessions complete, or lecturers publish assignment grades.",
      vi: "Nhận thông báo tức thời khi quá trình quét code hoàn tất, phiên chạy thử Runtime xong, hoặc khi giảng viên công bố điểm bài tập.",
    },
    cards: [
      {
        badge: "1",
        title: {
          en: "Filter Unread & Mark as Read",
          vi: "Lọc thư chưa đọc & Đánh dấu đã đọc",
        },
        description: {
          en: "Switch between All notifications and Unread only, or mark all notifications as read with one click.",
          vi: "Chuyển đổi giữa xem Tất cả hoặc Chỉ xem thông báo chưa đọc, và đánh dấu đã đọc toàn bộ chỉ với 1 cú bấm.",
        },
      },
      {
        badge: "2",
        title: {
          en: "One-Click Jump to Destination",
          vi: "Bấm để đi thẳng tới kết quả",
        },
        description: {
          en: "Click any notification item to jump directly to the completed analysis, runtime session, or graded submission.",
          vi: "Bấm vào nội dung thông báo để mở thẳng tới dự án vừa phân tích xong hoặc bài tập vừa có điểm.",
        },
      },
    ],
    steps: [
      {
        id: "notif-controls",
        selectors: ["main button", "main"],
        title: {
          en: "1. Unread Filter & Mark All as Read",
          vi: "1. Bộ lọc Chưa đọc & Đánh dấu tất cả đã đọc",
        },
        description: {
          en: "Filter your inbox to focus on new alerts or clear your unread badge.",
          vi: "Lọc nhanh các thông báo mới chưa xem hoặc bấm đánh dấu đã đọc tất cả.",
        },
      },
      {
        id: "notif-list",
        selectors: ["main ul", "main section", "main"],
        title: {
          en: "2. Notification Feed & Direct Links",
          vi: "2. Danh sách Thông báo & Liên kết mở nhanh",
        },
        description: {
          en: "Click a notification to mark it read and navigate to the linked project or assignment.",
          vi: "Bấm vào từng thông báo để xem chi tiết và chuyển thẳng tới màn hình kết quả tương ứng.",
        },
      },
    ],
  },
} satisfies Record<string, ScreenTourDefinition>;

const CATALOG_MAP: Record<string, ScreenTourDefinition> = SCREEN_TOUR_CATALOG;

const TITLE_TO_SCREEN_ID: Record<string, string> = {
  "overview": "overview",
  "my projects": "overview",
  "import project source": "import",
  "project overview": "project-overview",
  "source snapshots": "snapshots",
  "analysis history": "analysis-history",
  "architecture graph explorer": "architecture",
  "architecture diagrams": "diagrams",
  "architecture model editor": "model",
  "compare model versions": "compare",
  "change impact analysis": "impact",
  "runtime configuration": "runtime-config",
  "runtime scenarios": "scenarios",
  "runtime sessions": "sessions",
  "ai explanations": "explain",
  "my workspaces": "workspaces",
  "workspace overview": "workspace-overview",
  "class overview": "workspace-overview",
  "workspace members": "members",
  "class members": "members",
  "assignments": "assignments",
  "assignments & submit": "assignments",
  "reference source versions": "references",
  "my submissions": "submissions",
  "assignment submissions": "submissions",
  "my submissions / assignment submissions": "submissions",
  "submission details & review": "submission-review",
  "system health": "health",
  "analysis jobs": "jobs",
  "platform usage": "usage",
  "user account list": "users",
  "integration management": "integrations",
  "audit records": "audit",
  "runtime summary": "runtime-summary",
  "runtime execution profiles": "profiles",
  "my profile": "profile",
  "notifications": "notifications",
};

export function resolveScreenTour(screenIdOrTitle?: string | null): ScreenTourDefinition | null {
  if (!screenIdOrTitle) return null;
  const normalized = screenIdOrTitle.trim().toLowerCase();
  if (CATALOG_MAP[normalized]) {
    return CATALOG_MAP[normalized] ?? null;
  }
  const mappedId = TITLE_TO_SCREEN_ID[normalized];
  if (mappedId && CATALOG_MAP[mappedId]) {
    return CATALOG_MAP[mappedId] ?? null;
  }
  return null;
}
