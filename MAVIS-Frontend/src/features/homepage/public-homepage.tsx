"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  CodeXml,
  Cpu,
  GitBranch,
  GraduationCap,
  Layers,
  Menu,
  Radio,
  RefreshCw,
  ShieldCheck,
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

const studioDrills = [
  {
    icon: GitBranch,
    name: ["Change Impact", "Phân tích tác động"],
    detail: [
      "Lock your upstream blast-radius prediction before pausing a live container, then compare prediction vs. reality.",
      "Khóa dự đoán phạm vi ảnh hưởng trước khi tạm dừng container thật, rồi đối chiếu trực tiếp với thực tế.",
    ],
  },
  {
    icon: Layers,
    name: ["Scale-Out (1–3)", "Mở rộng bản sao (1–3)"],
    detail: [
      "Push live probe traffic up to 50 RPS and scale replicas 1→3 to verify p95 latency recovery.",
      "Tăng tải trực tiếp lên 50 RPS và nhân bản container 1→3 để kiểm chứng độ trễ p95 giảm thực tế.",
    ],
  },
  {
    icon: RefreshCw,
    name: ["Outage Recovery", "Khôi phục sự cố"],
    detail: [
      "Diagnose a stopped dependency from live RED metrics & logs, restart it, and restore 100% healthy traffic.",
      "Chẩn đoán dịch vụ lỗi từ log & chỉ số RED trực tiếp, khởi động lại và khôi phục 100% lưu lượng sạch.",
    ],
  },
  {
    icon: Cpu,
    name: ["CPU Cgroup Limit", "Giới hạn CPU (Cgroup)"],
    detail: [
      "Throttle container CPU quota (25%–100%) and observe latency degradation across downstream spans.",
      "Bóp định mức CPU cgroup (25%–100%) và quan sát độ trễ lan truyền thực tế trên chuỗi span.",
    ],
  },
] as const;

const showcaseViews = [
  {
    id: "studio",
    route: "maviss.site / studio-live",
    lightSrc: "/homepage/login-studio-light.webp",
    darkSrc: "/homepage/login-studio-dark.webp",
    tab: ["MAVIS Studio 3D", "MAVIS Studio 3D"],
    title: [
      "Interactive 3D Docker stage with real telemetry",
      "Sân khấu 3D chạy Docker thật & telemetry trực tiếp",
    ],
    description: [
      "Run isolated microservice clusters from API Gateway through core services to databases, capture verified 3D snapshots or 20s HD videos, and seal a SHA-256 RuntimeReceipt.",
      "Vận hành cụm microservice cô lập từ API Gateway qua core services đến cơ sở dữ liệu, chụp Snapshot hoặc quay Video 3D HD 20 giây và niêm phong biên nhận SHA-256.",
    ],
    alt: [
      "MAVIS Studio 3D stage displaying API Gateway, microservices, and database topology",
      "Sân khấu 3D MAVIS Studio hiển thị API Gateway, microservices và cơ sở dữ liệu",
    ],
  },
  {
    id: "architecture",
    route: "maviss.site / architecture",
    lightSrc: "/homepage/architecture.webp",
    darkSrc: "/homepage/architecture-dark.webp",
    tab: ["C1–C3 Architecture", "Kiến trúc C1–C3"],
    title: [
      "Source-grounded C4 diagrams & 3E analysis",
      "Sơ đồ C4 gắn chặt mã nguồn & phân tích 3E",
    ],
    description: [
      "Automatically project C1–C3 views, UML diagrams, and Dependency Graphs from Java or C# repositories with clickable file:line evidence and grounded AI explanations.",
      "Tự động dựng sơ đồ C1–C3, UML và đồ thị phụ thuộc từ mã nguồn Java/C# kèm dẫn chứng từng dòng code và giải thích AI kiểm chứng được.",
    ],
    alt: [
      "C4 Container diagram showing microservices, message brokers, and databases",
      "Sơ đồ C4 Container thể hiện các microservice, message broker và cơ sở dữ liệu",
    ],
  },
  {
    id: "course",
    route: "maviss.site / course-setup",
    lightSrc: "/homepage/course.webp",
    darkSrc: "/homepage/course-dark.webp",
    tab: ["Course & Visual Builder", "Lớp học & Soạn bài Lab"],
    title: [
      "Six-step course builder & Visual Studio Builder",
      "Quy trình 6 bước thiết lập lớp & soạn bài 3D trực quan",
    ],
    description: [
      "Import a repository, author lessons and Module Quizzes, configure Docker drills visually on a 3D canvas, publish with a Passkey, and grade evidence in SpeedGrader.",
      "Nhập repo nguồn, soạn bài học và trắc nghiệm Module, cấu hình kịch bản Docker ngay trên sân khấu 3D, cấp Passkey và chấm bài tập trung bằng SpeedGrader.",
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
      "The interactive simulation on this page is open to everyone. Sign in to join a class with a Passkey or manage your own courses.",
      "Bạn có thể tương tác trực tiếp với mô phỏng ngay trên trang chủ. Hãy đăng nhập để vào lớp bằng Passkey hoặc quản lý lớp học của bạn.",
    ],
  },
  {
    question: ["Where can I get a Passkey?", "Tôi lấy Passkey ở đâu?"],
    answer: [
      "Your lecturer issues the Passkey. After signing in, enter it in the Join a class section of My Courses.",
      "Giảng viên cấp Passkey cho từng lớp. Sau khi đăng nhập, vào Khóa học của tôi, chọn Tham gia lớp và nhập mã.",
    ],
  },
  {
    question: ["Which languages are supported?", "MAVIS hỗ trợ ngôn ngữ nào?"],
    answer: [
      "MAVIS supports static source analysis, C1–C3 & UML extraction, and guided Labs for Java and C# microservice projects.",
      "MAVIS hỗ trợ phân tích mã nguồn tĩnh, dựng sơ đồ C1–C3/UML và học liệu thực hành cho các dự án microservices Java và C#.",
    ],
  },
  {
    question: ["When can I run MAVIS Studio Live?", "Khi nào tôi có thể chạy MAVIS Studio Live?"],
    answer: [
      "MAVIS Studio Live unlocks once you pass the Lab's Step 2 Module Quiz (≥ 70%) on a Lab with a lecturer-verified Docker Compose runtime topology.",
      "MAVIS Studio Live mở khóa ngay khi bạn vượt qua bài kiểm tra trắc nghiệm (≥ 70%) ở Bước 2 trên các bài Lab đã được giảng viên xác minh hạ tầng Docker.",
    ],
  },
] as const;

function useScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!targets.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return rootRef;
}

export function PublicHomepage() {
  const { t } = useLocale();
  const rootRef = useScrollReveal();
  const [activeView, setActiveView] = useState<(typeof showcaseViews)[number]["id"]>("studio");

  const login = t("Sign in", "Đăng nhập");
  const currentShowcase =
    showcaseViews.find((item) => item.id === activeView) ?? showcaseViews[0];

  const sections = [
    { href: "#demo", label: t("Interactive demo", "Trải nghiệm") },
    { href: "#showcase", label: t("Product", "Sản phẩm") },
    { href: "#workflow", label: t("Learning path", "Lộ trình") },
    { href: "#classroom", label: t("For classes", "Lớp học") },
  ];

  return (
    <div ref={rootRef} className="mavis-v2" data-no-translate>
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
        <section className="v2-hero-band" aria-labelledby="home-title">
          <div className="v2-container v2-hero">
            <div className="v2-hero-copy">
              <h1 id="home-title" className="v2-enter" style={{ animationDelay: "0ms" }}>
                {t("Analyze architecture.", "Phân tích kiến trúc.")}
                <span className="v2-accent">
                  {t("Prove it on live Docker.", "Kiểm chứng trên Docker thật.")}
                </span>
              </h1>
              <p className="v2-enter" style={{ animationDelay: "70ms" }}>
                {t(
                  "Extract C1–C3 diagrams from Java and C# source code, run real Docker microservice stacks on an interactive 3D stage, stream OpenTelemetry traces, and submit SHA-256 verified Lab evidence.",
                  "Trích xuất sơ đồ C1–C3 từ mã nguồn Java & C#, vận hành cụm microservice Docker thật trên sân khấu 3D, quan sát OpenTelemetry và nộp gói minh chứng ký số SHA-256.",
                )}
              </p>
              <div className="v2-hero-actions v2-enter" style={{ animationDelay: "140ms" }}>
                <a className="v2-primary" href="#demo">
                  {t("Try interactive simulation", "Thử mô phỏng trực tiếp")}
                  <ArrowDown aria-hidden="true" />
                </a>
                <Link id="course-passkey" className="v2-secondary" href={joinPath}>
                  {t("Have a Passkey? Join a class", "Có Passkey? Vào lớp")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
              <dl
                className="v2-spec-strip v2-enter"
                style={{ animationDelay: "210ms" }}
                aria-label={t("Core platform capabilities", "Năng lực cốt lõi")}
              >
                <div>
                  <dt>{t("Source", "Mã nguồn")}</dt>
                  <dd>Java &amp; C#</dd>
                </div>
                <div>
                  <dt>{t("Runtime", "Thực thi")}</dt>
                  <dd>{t("Real Docker 3D", "Docker thật 3D")}</dd>
                </div>
                <div>
                  <dt>{t("Telemetry", "Quan sát")}</dt>
                  <dd>OpenTelemetry</dd>
                </div>
                <div>
                  <dt>{t("Proof", "Minh chứng")}</dt>
                  <dd>HMAC SHA-256</dd>
                </div>
              </dl>
            </div>
            <div className="v2-enter" style={{ animationDelay: "120ms" }}>
              <RequestDemo />
            </div>
          </div>
        </section>

        <section
          id="showcase"
          className="v2-container v2-section v2-showcase"
          aria-labelledby="v2-preview-title"
          data-reveal
        >
          <div className="v2-section-intro">
            <div>
              <span className="v2-kicker">{t("Inside MAVIS", "Bên trong MAVIS")}</span>
              <h2 id="v2-preview-title">
                {t("Built for real microservice Labs", "Thiết kế cho bài Lab microservices thật")}
              </h2>
            </div>
            <p>
              {t(
                "Switch between the live 3D Docker studio, static C1–C3 architecture analysis, and the 6-step lecturer builder.",
                "Chuyển nhanh giữa sân khấu Studio 3D Docker thật, phân tích kiến trúc tĩnh C1–C3 và bộ công cụ tạo lớp 6 bước.",
              )}
            </p>
          </div>

          <div className="v2-showcase-tabs" role="tablist" aria-label={t("Product views", "Màn hình sản phẩm")}>
            {showcaseViews.map((item) => {
              const selected = item.id === activeView;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="v2-showcase-tab"
                  onClick={() => setActiveView(item.id)}
                >
                  {t(item.tab[0], item.tab[1])}
                </button>
              );
            })}
          </div>

          <div className="v2-showcase-shell" key={currentShowcase.id}>
            <div className="v2-browser-bar">
              <div className="v2-browser-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <code className="v2-browser-url">{currentShowcase.route}</code>
              <span className="v2-browser-status">
                <Box aria-hidden="true" />
                {t("Live workspace", "Giao diện thực tế")}
              </span>
            </div>
            <div className="v2-showcase-stage">
              <Image
                className="v2-preview-light"
                src={currentShowcase.lightSrc}
                alt={t(currentShowcase.alt[0], currentShowcase.alt[1])}
                width={1440}
                height={864}
                unoptimized
              />
              <Image
                className="v2-preview-dark"
                src={currentShowcase.darkSrc}
                alt={t(currentShowcase.alt[0], currentShowcase.alt[1])}
                width={1440}
                height={864}
                unoptimized
              />
            </div>
            <div className="v2-showcase-caption">
              <h3>{t(currentShowcase.title[0], currentShowcase.title[1])}</h3>
              <p>{t(currentShowcase.description[0], currentShowcase.description[1])}</p>
            </div>
          </div>

          <div className="v2-drills" aria-label={t("MAVIS Studio live drills", "4 bài thực hành Docker thật")}>
            {studioDrills.map(({ icon: Icon, name, detail }, idx) => (
              <article
                key={name[0]}
                className="v2-drill-card"
                data-reveal
                style={{ transitionDelay: `${idx * 55}ms` }}
              >
                <span className="v2-drill-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{t(name[0], name[1])}</h3>
                <p>{t(detail[0], detail[1])}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="v2-lab" aria-labelledby="v2-lab-title">
          <div className="v2-container v2-section">
            <div className="v2-section-intro" data-reveal>
              <div>
                <span className="v2-kicker">{t("4-stage learning flow", "Quy trình học 4 giai đoạn")}</span>
                <h2 id="v2-lab-title">
                  {t("From source code to Lab submission", "Từ mã nguồn đến bài nộp Lab")}
                </h2>
              </div>
              <p>
                {t(
                  "Every step produces verifiable evidence — from static code proof and Module Quiz gates to signed Docker runtime receipts.",
                  "Mỗi bước đều tạo ra minh chứng kiểm chứng được — từ dẫn chứng mã nguồn và cổng Trắc nghiệm đến biên nhận Docker ký số.",
                )}
              </p>
            </div>
            <ol className="v2-milestones">
              {milestones.map(({ icon: Icon, title, result, text }, index) => (
                <li
                  key={title[0]}
                  data-reveal
                  style={{ transitionDelay: `${index * 70}ms` }}
                >
                  <div className="v2-step-number">
                    <span>0{index + 1}</span>
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{t(title[0], title[1])}</h3>
                  <p>{t(text[0], text[1])}</p>
                  <strong>
                    <ShieldCheck aria-hidden="true" />
                    {t(result[0], result[1])}
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="classroom" className="v2-classroom" aria-labelledby="v2-class-title">
          <div className="v2-container v2-section v2-class-inner" data-reveal>
            <div>
              <span className="v2-kicker">{t("Classroom workflow", "Dành cho lớp học")}</span>
              <h2 id="v2-class-title">
                {t("Bring real architecture into your class", "Đưa thực hành kiến trúc vào lớp học")}
              </h2>
              <p className="v2-class-lead">
                {t(
                  "One unified workspace connecting students’ verified Docker runs directly to the lecturer’s SpeedGrader.",
                  "Một không gian thống nhất nối thẳng phiên thực hành Docker đã niêm phong của sinh viên sang SpeedGrader của giảng viên.",
                )}
              </p>
            </div>
            <div className="v2-roles">
              <article>
                <span className="v2-role-icon" aria-hidden="true">
                  <GraduationCap />
                </span>
                <h3>{t("Students", "Sinh viên")}</h3>
                <p>
                  {t(
                    "Join with a Passkey, pass Module Quizzes, run real Docker drills in Studio 3D, capture Snapshots/Videos, and submit signed evidence.",
                    "Vào lớp bằng Passkey, vượt qua Trắc nghiệm, chạy Docker thật trên Studio 3D, chụp Snapshot/Video và nộp gói minh chứng ký số.",
                  )}
                </p>
                <Link className="v2-text-action" href={joinPath}>
                  {t("Join a class", "Tham gia lớp")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
              <article>
                <span className="v2-role-icon" aria-hidden="true">
                  <Users />
                </span>
                <h3>{t("Lecturers", "Giảng viên")}</h3>
                <p>
                  {t(
                    "Import Java/C# repos, design Studio Labs visually in 3D, verify preflight rules, and grade predictions vs. actual impact in SpeedGrader.",
                    "Nhập repo Java/C#, soạn kịch bản Studio 3D trực quan, kiểm tra Docker Preflight và chấm đối chiếu dự đoán trong SpeedGrader.",
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

        <section
          className="v2-container v2-section v2-faq"
          aria-labelledby="v2-faq-title"
          data-reveal
        >
          <div>
            <span className="v2-kicker">FAQ</span>
            <h2 id="v2-faq-title">{t("Frequently asked questions", "Câu hỏi thường gặp")}</h2>
          </div>
          <div className="v2-faq-list">
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
            <MavisLogo compact className="size-7" />
            <span>MAVIS</span>
          </Link>
          <p>
            {t(
              "Microservices architecture learning, 3D Docker Studio & change impact verification",
              "Nền tảng học tập kiến trúc microservices, MAVIS Studio 3D Docker & kiểm chứng tác động",
            )}
          </p>
          <a href="#demo">{t("Back to simulation", "Quay lại mô phỏng")}</a>
          <Link href="/login">
            {login}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
