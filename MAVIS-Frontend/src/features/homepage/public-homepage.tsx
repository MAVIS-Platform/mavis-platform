"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  ChevronDown,
  CodeXml,
  GraduationCap,
  Menu,
  Network,
  Radio,
  Users,
  Waypoints,
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
    result: ["C4 views and code evidence", "Sơ đồ C4 và bằng chứng mã"],
    text: [
      "Find the services, see how they connect, and check where each dependency is defined.",
      "Xác định dịch vụ, xem chúng kết nối ra sao và tìm đoạn mã định nghĩa từng phụ thuộc.",
    ],
  },
  {
    icon: BookOpen,
    title: ["Study and take a quiz", "Học và làm Quiz"],
    result: ["Theory checkpoint", "Kiểm tra kiến thức"],
    text: [
      "Study the reference model, then complete the published Quiz for your Lab.",
      "Đọc mô hình tham chiếu rồi làm bài Quiz đã công bố cho Lab.",
    ],
  },
  {
    icon: Radio,
    title: ["Investigate a change", "Quan sát thay đổi"],
    result: ["Before and after evidence", "Bằng chứng trước và sau"],
    text: [
      "In a configured Runtime Lab, use OpenTelemetry and Studio to see how the system responds.",
      "Trong Lab có Runtime, dùng OpenTelemetry và Studio để xem hệ thống phản ứng ra sao.",
    ],
  },
  {
    icon: Check,
    title: ["Submit your findings", "Nộp kết quả"],
    result: ["Reviewed evidence", "Minh chứng đã chấm"],
    text: [
      "Explain your evidence, read feedback, and unlock the next Lab when you pass.",
      "Giải thích kết quả, đọc phản hồi và mở Lab tiếp theo khi đạt yêu cầu.",
    ],
  },
] as const;

const screens = [
  {
    image: "/homepage/architecture.webp",
    icon: Network,
    title: ["Architecture Explorer", "Khám phá kiến trúc"],
    description: [
      "See how services relate and trace a dependency back to its source.",
      "Xem quan hệ giữa các dịch vụ và lần theo một phụ thuộc đến mã nguồn.",
    ],
    alt: [
      "Architecture Explorer with the dependency graph of the sample Payments Platform",
      "Màn hình phân tích với đồ thị phụ thuộc của dự án Payments Platform mẫu",
    ],
  },
  {
    image: "/homepage/studio.webp",
    icon: Waypoints,
    title: ["MAVIS Studio", "MAVIS Studio"],
    description: [
      "Inspect a request and compare evidence around a change in a prepared Lab.",
      "Theo dõi yêu cầu và đối chiếu bằng chứng trước, sau thay đổi trong Lab đã cấu hình.",
    ],
    alt: [
      "MAVIS Studio workbench with a sample topology and service controls",
      "Studio với topology mẫu và các điều khiển dịch vụ",
    ],
  },
  {
    image: "/homepage/course.webp",
    icon: GraduationCap,
    title: ["Course setup", "Chuẩn bị lớp học"],
    description: [
      "Prepare reference material, check Lab readiness, and give students a Passkey.",
      "Chuẩn bị tài liệu tham chiếu, kiểm tra Lab và cấp Passkey cho sinh viên.",
    ],
    alt: [
      "Lecturer course setup checklist with a sample class",
      "Checklist chuẩn bị một lớp học mẫu của giảng viên",
    ],
  },
] as const;

const questions = [
  {
    question: ["Do I need an account to try this?", "Tôi có cần tài khoản để xem thử?"],
    answer: [
      "The example above is available to everyone. Sign in to join a class or use a workspace.",
      "Bạn có thể thử tình huống ở trên ngay. Đăng nhập để tham gia lớp hoặc dùng workspace.",
    ],
  },
  {
    question: ["Where can I get a Passkey?", "Tôi lấy Passkey ở đâu?"],
    answer: [
      "Your lecturer issues the Passkey. After signing in, enter it in the Join a class section of My Courses.",
      "Giảng viên của lớp cấp Passkey. Sau khi đăng nhập, nhập key trong mục Tham gia lớp của Khóa học của tôi.",
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
      "Studio Sandbox mô phỏng thay đổi. Studio Live dùng Docker và OpenTelemetry trong Lab đã cấu hình, khi bạn đáp ứng điều kiện của bài.",
    ],
  },
] as const;

export function PublicHomepage() {
  const { t } = useLocale();
  const [screen, setScreen] = useState<(typeof screens)[number]>(screens[0]);
  const login = t("Sign in", "Đăng nhập");
  const trySample = t("Try the sample scenario", "Thử tình huống mẫu");
  const sections = [
    { href: "#demo", label: t("Explore", "Trải nghiệm") },
    { href: "#workflow", label: t("Learning path", "Lộ trình") },
    { href: "#workspace", label: t("Workspace", "Workspace") },
    { href: "#classroom", label: t("For classes", "Lớp học") },
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
                  <a
                    key={href}
                    href={href}
                    onClick={(event) =>
                      event.currentTarget.closest("details")?.removeAttribute("open")
                    }
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="v2-hero-surface" aria-labelledby="home-title">
          <div className="v2-container v2-hero">
            <div className="v2-hero-copy">
              <h1 id="home-title">
                {t(
                  "Follow a request across microservices",
                  "Theo dấu một yêu cầu qua hệ thống microservices",
                )}
              </h1>
              <p>
                {t(
                  "Learn to read Java and C# architectures, find evidence in the source, and see what happens when a service stops.",
                  "Học cách đọc kiến trúc Java và C#, tìm bằng chứng trong mã nguồn và xem điều gì xảy ra khi một dịch vụ dừng.",
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
          </div>
        </section>

        <section id="workflow" className="v2-lab" aria-labelledby="v2-lab-title">
          <div className="v2-container v2-section">
            <div className="v2-section-intro">
              <h2 id="v2-lab-title">
                {t(
                  "A guided Lab, from source to submission",
                  "Một buổi Lab từ mã nguồn đến bài nộp",
                )}
              </h2>
              <p>
                {t(
                  "Each step gives you a result to inspect, explain, or hand in.",
                  "Mỗi bước cho bạn một kết quả để xem lại, giải thích hoặc nộp bài.",
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
                  <strong>
                    <ChevronRight aria-hidden="true" />
                    {t(result[0], result[1])}
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="workspace"
          className="v2-container v2-section v2-previews"
          aria-labelledby="v2-preview-title"
        >
          <div className="v2-section-intro">
            <h2 id="v2-preview-title">
              {t("Inside the MAVIS workspace", "Bên trong workspace MAVIS")}
            </h2>
            <p>
              {t(
                "Screens from the application with sample data.",
                "Giao diện ứng dụng với dữ liệu minh họa.",
              )}
            </p>
          </div>
          <div className="v2-gallery">
            <div className="v2-gallery-selector">
              <div
                className="v2-gallery-controls"
                role="group"
                aria-label={t("Workspace screens", "Màn hình workspace")}
              >
                {screens.map((option) => {
                  const { image, icon: Icon, title } = option;
                  return (
                    <button
                      key={image}
                      type="button"
                      aria-pressed={option === screen}
                      aria-controls="v2-workspace-preview"
                      onClick={() => setScreen(option)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{t(title[0], title[1])}</span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <p aria-live="polite">{t(screen.description[0], screen.description[1])}</p>
            </div>
            <figure id="v2-workspace-preview">
              <figcaption>
                <span>{t(screen.title[0], screen.title[1])}</span>
                <a
                  className="v2-text-action"
                  href={screen.image}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Open full image", "Mở ảnh gốc")}
                  <ArrowUpRight aria-hidden="true" />
                  <span className="sr-only">{t(" (new tab)", " (tab mới)")}</span>
                </a>
              </figcaption>
              <Image
                src={screen.image}
                alt={t(screen.alt[0], screen.alt[1])}
                width={800}
                height={480}
                unoptimized
              />
            </figure>
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
                    "Vào lớp bằng Passkey, theo dõi tiến độ Lab và nhận phản hồi trên minh chứng của bạn.",
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
                    "Chuẩn bị lớp, công bố Lab có hướng dẫn và chấm bài nộp của sinh viên.",
                  )}
                </p>
                <Link className="v2-text-action" href={lecturerPath}>
                  {t("Open workspaces", "Mở workspace")}
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
