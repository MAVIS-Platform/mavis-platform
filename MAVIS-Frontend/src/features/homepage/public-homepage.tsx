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
    title: ["Read the architecture", "Đọc kiến trúc"],
    result: ["C4 diagrams and source evidence", "Sơ đồ C4 và trích đoạn mã"],
    text: [
      "Identify the services and trace their dependencies to the code that connects them.",
      "Xác định các dịch vụ và lần theo từng phụ thuộc đến đoạn mã tạo ra kết nối.",
    ],
  },
  {
    icon: BookOpen,
    title: ["Study and take a quiz", "Học lý thuyết và làm bài kiểm tra"],
    result: ["Quiz result", "Kết quả kiểm tra"],
    text: [
      "Read the Lab materials, compare your findings with the reference model, and take the quiz.",
      "Đọc học liệu, đối chiếu kết quả phân tích với mô hình tham chiếu và làm bài kiểm tra.",
    ],
  },
  {
    icon: Radio,
    title: ["Investigate a change", "Quan sát thay đổi"],
    result: ["Before and after evidence", "Bằng chứng trước và sau"],
    text: [
      "In Labs with runtime enabled, use OpenTelemetry traces and MAVIS Studio to compare how the system behaves before and after a change.",
      "Với Lab có cấu hình runtime, dùng trace OpenTelemetry và MAVIS Studio để quan sát hệ thống trước và sau thay đổi.",
    ],
  },
  {
    icon: Check,
    title: ["Submit your findings", "Nộp kết quả"],
    result: ["Grade and feedback", "Điểm và phản hồi"],
    text: [
      "Submit your evidence and explanation for review. The next Lab opens when your submission meets the requirements.",
      "Nộp minh chứng kèm giải thích để giảng viên chấm. Lab tiếp theo mở khi bài nộp đạt yêu cầu.",
    ],
  },
] as const;

const screens = [
  {
    image: "architecture",
    title: ["Architecture Explorer", "Khám phá kiến trúc"],
    description: [
      "See how services relate and trace a dependency back to its source.",
      "Xem các dịch vụ kết nối với nhau như thế nào và tìm đoạn mã thể hiện từng phụ thuộc.",
    ],
    alt: [
      "Architecture Explorer with the dependency graph of the sample Payments Platform",
      "Màn hình phân tích với đồ thị phụ thuộc của dự án Payments Platform mẫu",
    ],
  },
  {
    image: "studio",
    title: ["MAVIS Studio", "MAVIS Studio"],
    description: [
      "Follow a request and compare runtime evidence before and after a service change.",
      "Theo dõi yêu cầu và so sánh minh chứng trước và sau khi thay đổi một dịch vụ.",
    ],
    alt: [
      "MAVIS Studio workbench with a sample topology and service controls",
      "MAVIS Studio với sơ đồ dịch vụ mẫu và các nút điều khiển",
    ],
  },
  {
    image: "course",
    title: ["Course setup", "Chuẩn bị lớp học"],
    description: [
      "Set up reference sources, check that Labs are ready, and issue a Passkey for the class.",
      "Thiết lập nguồn tham chiếu, kiểm tra Lab đã sẵn sàng và cấp mã tham gia lớp.",
    ],
    alt: [
      "Lecturer course setup checklist with a sample class",
      "Danh sách các bước chuẩn bị lớp học mẫu dành cho giảng viên",
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
    question: ["When can I run Studio Live?", "Khi nào tôi có thể chạy Studio Live?"],
    answer: [
      "Studio Sandbox simulates changes. Studio Live uses Docker and OpenTelemetry in a prepared Lab when its requirements are met.",
      "Bạn có thể vào Studio Live khi giảng viên đã cấu hình runtime cho Lab và bạn đã hoàn thành các bước bắt buộc. Studio Live chạy dịch vụ bằng Docker và thu thập dữ liệu qua OpenTelemetry.",
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
