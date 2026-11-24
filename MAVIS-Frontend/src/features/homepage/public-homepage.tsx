"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CodeXml,
  GraduationCap,
  Menu,
  Radio,
  Users,
} from "lucide-react";
import { AppearanceSelector } from "@/components/appearance-selector";
import { MavisLogo } from "@/components/mavis-logo";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { RequestDemo } from "./request-demo";

const joinPath = "/login?next=%2Fcourses%23course-passkey";
const lecturerPath = "/login?next=%2Fworkspaces";

const milestones = [
  {
    icon: CodeXml,
    title: ["Static C1–C3 & AI", "Kiến trúc tĩnh C1–C3 & AI"],
    result: ["C1–C3 diagrams & file:line evidence", "Sơ đồ C1–C3 và bằng chứng mã nguồn"],
    text: [
      "Analyze curated Java and C# repos to extract C1–C3 views, Dependency Graph, 3E findings, and evidence-grounded AI explanations.",
      "Phân tích repo mẫu Java/C# trích xuất sơ đồ C1–C3, Đồ thị phụ thuộc, 5 luật 3E và giải thích AI trích dẫn đúng dòng code.",
    ],
  },
  {
    icon: BookOpen,
    title: ["Theory, Reverse BFS & Module Quiz", "Lý thuyết, Reverse BFS & Trắc nghiệm Module"],
    result: ["Module Quiz ≥ 70% unlock", "Đạt Trắc nghiệm ≥ 70% mở khóa Runtime"],
    text: [
      "Read guided architecture theory, trace cycle-safe Reverse BFS blast radius, and pass the versioned Module Quiz to unlock live Docker.",
      "Đọc tài liệu lý thuyết, truy vết lan truyền ngược Reverse BFS và vượt qua bài trắc nghiệm Module để mở khóa môi trường Docker thật.",
    ],
  },
  {
    icon: Radio,
    title: ["Live Docker & OTel Runtime", "Docker thật & OpenTelemetry Runtime"],
    result: ["Real OTel traces & metrics", "Trace OpenTelemetry & chỉ số thực tế"],
    text: [
      "Validate Docker Compose preflight rules, start isolated Lab containers, and observe live distributed OpenTelemetry spans on 2D/3D graphs.",
      "Kiểm tra an toàn Compose Preflight, khởi chạy container thật và quan sát luồng gói tin OpenTelemetry trực tiếp trên đồ thị 2D/3D.",
    ],
  },
  {
    icon: Check,
    title: ["MAVIS Studio & 4-Stage Submission", "MAVIS Studio & Nộp bài 4 bước"],
    result: ["Signed RuntimeReceipt & > 5.0/10 grade", "Biên nhận HMAC & chấm > 5.0/10 mở Lab kế"],
    text: [
      "Execute real Stop/Start and Scale (1–3) actions, compare Before vs. After impact, freeze your 4-stage SHA-256 package, and unlock the next Lab.",
      "Thực thi Stop/Start và Scale (1–3) thật, so sánh Trước/Sau, đóng băng gói minh chứng 4 bước SHA-256 và mở khóa bài Lab kế tiếp.",
    ],
  },
] as const;

const screens = [
  {
    image: "architecture",
    title: ["Architecture Explorer", "Khám phá kiến trúc"],
    description: [
      "Inspect C4 container diagrams, service dependencies, message brokers, and data stores.",
      "Xem sơ đồ C4 Container, kết nối giữa các service, hàng đợi thông điệp và cơ sở dữ liệu.",
    ],
    alt: [
      "C4 Container diagram showing microservices, message brokers, and databases",
      "Sơ đồ C4 Container thể hiện các microservice, message broker và cơ sở dữ liệu",
    ],
  },
  {
    image: "studio",
    title: ["MAVIS Studio", "MAVIS Studio"],
    description: [
      "Visualize live 3D microservices, trace Change Impact paths, and run real Docker drills.",
      "Quan sát microservice trên sân khấu 3D, truy vết Change Impact và chạy bài thực hành Docker thật.",
    ],
    alt: [
      "MAVIS Studio 3D topology with Change Impact paths and Visual Studio Builder",
      "Sân khấu 3D MAVIS Studio với đường lan truyền Change Impact và bảng soạn bài trực quan",
    ],
  },
  {
    image: "course",
    title: ["Course setup", "Chuẩn bị lớp học"],
    description: [
      "Follow the 6-step course setup flow from repository import to Visual Studio Builder and publishing.",
      "Theo dõi quy trình 6 bước từ nhập repo nguồn đến thiết lập Studio Lab và công bố cho lớp học.",
    ],
    alt: [
      "Six-step course setup flow with Visual Studio Builder readiness card",
      "Quy trình thiết lập khóa học 6 bước kèm thẻ cấu hình Visual Studio Builder",
    ],
  },
] as const;

const questions = [
  {
    question: ["Do I need an account to try this?", "Tôi có cần tài khoản để xem thử?"],
    answer: [
      "The homepage demo is open to everyone. Sign in to join a class or access your workspace.",
      "Bạn có thể thử demo ngay trên trang chủ. Hãy đăng nhập để vào lớp hoặc sử dụng không gian làm việc của mình.",
    ],
  },
  {
    question: ["Where can I get a Passkey?", "Tôi lấy Passkey ở đâu?"],
    answer: [
      "Your lecturer issues the Passkey. After signing in, enter it in the Join a class section of My Courses.",
      "Giảng viên cấp Passkey cho lớp. Sau khi đăng nhập, vào Khóa học của tôi, chọn Tham gia lớp và nhập mã.",
    ],
  },
  {
    question: ["Which languages are supported?", "MAVIS hỗ trợ ngôn ngữ nào?"],
    answer: [
      "MAVIS supports source analysis and learning materials for Java and C#. Your lecturer chooses a source and activities for each Lab.",
      "MAVIS hỗ trợ phân tích mã nguồn và học liệu Java, C#. Giảng viên chọn nguồn mẫu và hoạt động cho từng Lab.",
    ],
  },
  {
    question: ["When can I run MAVIS Studio Live?", "Khi nào tôi có thể chạy MAVIS Studio Live?"],
    answer: [
      "MAVIS Studio Live unlocks once you pass the Lab's Step 2 Module Quiz (≥ 70%) on a Lab with a lecturer-verified Docker Compose runtime topology.",
      "MAVIS Studio Live mở khóa ngay khi bạn vượt qua bài kiểm tra trắc nghiệm (≥ 70%) ở Bước 2 trên các bài Lab đã được giảng viên cấu hình và xác minh hạ tầng Docker.",
    ],
  },
] as const;

export function PublicHomepage() {
  const { t } = useLocale();
  const login = t("Sign in", "Đăng nhập");
  const trySample = t("Try the architecture demo", "Thử demo kiến trúc");
  const sections = [
    { href: "#demo", label: t("Explore", "Trải nghiệm") },
    { href: "#workflow", label: t("Learning path", "Lộ trình") },
    { href: "#classroom", label: t("For classes", "Dành cho lớp học") },
  ];

  return (
    <div className="mavis-v2" data-no-translate>
      <a href="#main" className="v2-skip">
        {t("Skip to content", "Đến nội dung chính")}
      </a>
      <header className="v2-header">
        <div className="v2-container v2-header-inner">
          <Link href="/" className="v2-brand" aria-label={t("MAVIS home", "Trang chủ MAVIS")}>
            <MavisLogo compact className="size-9" />
            <span aria-hidden="true">MAVIS</span>
          </Link>
          <nav className="v2-nav" aria-label={t("On this page", "Trên trang này")}>
            {sections.map(({ href, label }) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="v2-header-actions">
            <LocaleSwitchButton />
            <AppearanceSelector />
            <Link className="v2-header-login" href="/login">
              {login}
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <details className="v2-mobile-menu">
              <summary aria-label={t("Page menu", "Menu trang")}>
                <Menu aria-hidden="true" />
              </summary>
              <nav aria-label={t("On this page", "Trên trang này")}>
                {sections.map(({ href, label }) => (
                  <a key={href} href={href}>
                    {label}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="v2-container v2-hero" aria-labelledby="home-title">
          <div className="v2-hero-copy">
            <h1 id="home-title">
              {t("Explore microservices architecture", "Khám phá kiến trúc microservices")}
            </h1>
            <p>
              {t(
                "Analyze Java and C# source code, follow requests across services, and see what happens when a dependency goes offline.",
                "Phân tích mã nguồn Java và C#, theo dõi yêu cầu đi qua các dịch vụ và khám phá điều gì xảy ra khi một dịch vụ ngừng hoạt động.",
              )}
            </p>
            <div className="v2-hero-actions">
              <a className="v2-primary" href="#demo">
                {trySample}
                <ArrowDown aria-hidden="true" />
              </a>
              <Link id="course-passkey" className="v2-text-action" href={joinPath}>
                {t("Have a Passkey? Join a class", "Có Passkey? Vào lớp")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
          <RequestDemo />
        </section>

        <section id="workflow" className="v2-lab" aria-labelledby="v2-lab-title">
          <div className="v2-container v2-section">
            <div className="v2-section-intro">
              <h2 id="v2-lab-title">
                {t("From source code to Lab submission", "Từ mã nguồn đến bài nộp Lab")}
              </h2>
              <p>
                {t(
                  "Build evidence for your findings as you work through a guided Lab.",
                  "Thu thập minh chứng qua từng bước để giải thích kết quả phân tích trong bài nộp.",
                )}
              </p>
            </div>
            <ol className="v2-milestones">
              {milestones.map(({ icon: Icon, title, result, text }, index) => (
                <li key={title[0]}>
                  <div className="v2-step-number">
                    <span>{index + 1}</span>
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{t(title[0], title[1])}</h3>
                  <p>{t(text[0], text[1])}</p>
                  <strong>{t(result[0], result[1])}</strong>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="v2-container v2-section v2-previews" aria-labelledby="v2-preview-title">
          <div className="v2-section-intro">
            <h2 id="v2-preview-title">
              {t("Inside the MAVIS workspace", "Không gian làm việc MAVIS")}
            </h2>
            <p>
              {t(
                "Screens from the application with sample data.",
                "Giao diện ứng dụng với dữ liệu minh họa.",
              )}
            </p>
          </div>
          <div className="v2-gallery">
            {screens.map(({ image, title, description, alt }) => (
              <figure key={image}>
                {(["light", "dark"] as const).map((appearance) => (
                  <Image
                    key={appearance}
                    className={`v2-preview-${appearance}`}
                    src={`/homepage/${image}${appearance === "dark" ? "-dark" : ""}.webp`}
                    alt={t(alt[0], alt[1])}
                    width={960}
                    height={576}
                    unoptimized
                  />
                ))}
                <figcaption>
                  <h3>{t(title[0], title[1])}</h3>
                  <p>{t(description[0], description[1])}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="classroom" className="v2-classroom" aria-labelledby="v2-class-title">
          <div className="v2-container v2-section v2-class-inner">
            <h2 id="v2-class-title">
              {t("Bring architecture into your class", "Đưa kiến trúc vào lớp học")}
            </h2>
            <div className="v2-roles">
              <article>
                <GraduationCap aria-hidden="true" />
                <h3>{t("Students", "Sinh viên")}</h3>
                <p>
                  {t(
                    "Join with a Passkey, follow your Lab progress, and get feedback on your evidence.",
                    "Nhập mã tham gia lớp (Passkey), theo dõi tiến độ Lab và xem phản hồi của giảng viên trên từng bài nộp.",
                  )}
                </p>
                <Link className="v2-text-action" href={joinPath}>
                  {t("Join a class", "Tham gia lớp")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
              <article>
                <Users aria-hidden="true" />
                <h3>{t("Lecturers", "Giảng viên")}</h3>
                <p>
                  {t(
                    "Set up a class, publish guided Labs, and review student submissions.",
                    "Thiết lập lớp và nguồn tham chiếu, công bố Lab, chấm bài và theo dõi tiến độ sinh viên.",
                  )}
                </p>
                <Link className="v2-text-action" href={lecturerPath}>
                  {t("Open workspaces", "Mở không gian làm việc")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="v2-container v2-section v2-faq" aria-labelledby="v2-faq-title">
          <h2 id="v2-faq-title">{t("Frequently asked questions", "Câu hỏi thường gặp")}</h2>
          <div>
            {questions.map(({ question, answer }) => (
              <details key={question[0]}>
                <summary>
                  {t(question[0], question[1])}
                  <ChevronDown aria-hidden="true" />
                </summary>
                <p>{t(answer[0], answer[1])}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="v2-footer">
        <div className="v2-container v2-footer-inner">
          <Link href="/" className="v2-brand">
            MAVIS
          </Link>
          <p>
            {t(
              "Microservices architecture learning and analysis",
              "Học tập và phân tích kiến trúc microservices",
            )}
          </p>
          <a href="#demo">{t("Back to the example", "Quay lại tình huống mẫu")}</a>
          <Link href="/login">
            {login}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
