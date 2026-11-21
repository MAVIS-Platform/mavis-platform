"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Box,
  CodeXml,
  GitFork,
  RotateCcw,
  ShoppingBag,
  Wallet,
  Workflow,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";
import { sampleScenario, type ServiceName } from "./scenario";

const serviceIcons = { Gateway: Workflow, Orders: ShoppingBag, Payments: Wallet, Inventory: Box };
const serviceNames: ServiceName[] = ["Gateway", "Orders", "Inventory", "Payments"];
const phases = [
  { id: "source", icon: CodeXml, en: "Source", vi: "Mã nguồn" },
  { id: "trace", icon: Activity, en: "Trace", vi: "Luồng chạy (Trace)" },
  { id: "impact", icon: GitFork, en: "Impact", vi: "Tác động" },
] as const;

export function RequestDemo() {
  const { t } = useLocale();
  const [selected, select] = useState<ServiceName>("Orders");
  const [phase, setPhase] = useState<(typeof phases)[number]["id"]>("source");
  const [stopped, setStopped] = useState(false);
  const { services, edges, request } = sampleScenario;
  const service = services[selected];

  function reset() {
    select("Orders");
    setPhase("source");
    setStopped(false);
  }

  return (
    <section className="v2-console" id="demo" tabIndex={-1} aria-labelledby="v2-demo-title">
      <div className="v2-console-head">
        <div>
          <h2 id="v2-demo-title">{t("Request explorer", "Theo dõi luồng yêu cầu")}</h2>
          <p>{t("Browser simulation", "Mô phỏng trong trình duyệt")}</p>
        </div>
        <button
          type="button"
          className="v2-reset"
          onClick={reset}
          aria-label={t("Reset scenario", "Đặt lại tình huống")}
          title={t("Reset scenario", "Đặt lại tình huống")}
        >
          <RotateCcw aria-hidden="true" />
        </button>
      </div>

      <div className="v2-request-row">
        <code>{request}</code>
        <span className="v2-request-status" data-fault={stopped} role="status">
          <span aria-hidden="true" />
          {stopped
            ? t("503 · Unavailable", "503 · Gián đoạn")
            : t("200 · Succeeded", "200 · Thành công")}
        </span>
      </div>

      <div
        className="v2-topology"
        role="group"
        aria-label={t("Inspect a service", "Xem chi tiết dịch vụ")}
      >
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(({ from, to, path }) => (
            <path
              key={to}
              d={path}
              className={from === selected || to === selected ? "mavis-packet-edge" : undefined}
              vectorEffect="non-scaling-stroke"
              data-related={from === selected || to === selected}
              data-fault={stopped && to !== "Inventory"}
            />
          ))}
        </svg>
        {serviceNames.map((name) => {
          const Icon = serviceIcons[name];
          const { x, y } = services[name];
          return (
            <button
              key={name}
              type="button"
              className="v2-service"
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-pressed={selected === name}
              onClick={() => select(name)}
              data-stopped={stopped && name === "Payments"}
            >
              <Icon aria-hidden="true" />
              <span>{name}</span>
            </button>
          );
        })}
      </div>

      <div
        className="v2-phases"
        role="group"
        aria-label={t("Scenario step", "Bước trong tình huống")}
      >
        {phases.map(({ id, icon: Icon, en, vi }) => (
          <button
            type="button"
            key={id}
            id={`v2-phase-${id}`}
            aria-pressed={phase === id}
            onClick={() => setPhase(id)}
          >
            <Icon aria-hidden="true" />
            {t(en, vi)}
          </button>
        ))}
      </div>

      <div className="v2-evidence">
        {phase === "source" && (
          <>
            <div className="v2-panel-head">
              <h3>{selected}</h3>
              <code>{service.file}</code>
            </div>
            <pre>
              <code>{service.code}</code>
            </pre>
            <p>
              {selected === "Orders"
                ? t(
                    "Orders reserves inventory and calls Payments to authorize the order.",
                    "Orders gọi Inventory để giữ hàng và gọi Payments để xác thực thanh toán.",
                  )
                : t(
                    "Select Orders to see where these dependencies come from.",
                    "Chọn Orders để xem đoạn mã tạo các liên kết này.",
                  )}
            </p>
          </>
        )}
        {phase === "trace" && (
          <>
            <div className="v2-panel-head">
              <h3>
                {stopped
                  ? t("Trace before the change", "Trace trước thay đổi")
                  : t("Example trace", "Trace minh họa")}
              </h3>
              <code>0–184 ms</code>
            </div>
            <ul
              className="v2-spans"
              aria-label={t("Spans in request order", "Các span theo thứ tự yêu cầu")}
            >
              {serviceNames.map((name) => {
                const span = services[name];
                return (
                  <li key={name}>
                    <button
                      type="button"
                      aria-pressed={selected === name}
                      onClick={() => select(name)}
                    >
                      <span>{name}</span>
                      <span className="v2-span-track" aria-hidden="true">
                        <span
                          style={{
                            insetInlineStart: `${span.start / 1.84}%`,
                            inlineSize: `${span.duration / 1.84}%`,
                          }}
                        />
                      </span>
                      <code>{span.duration} ms</code>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p aria-live="polite">{service.span}</p>
          </>
        )}
        {phase === "impact" && (
          <>
            <div className="v2-panel-head">
              <h3>{t("What if Payments stops?", "Nếu Payments dừng thì sao?")}</h3>
              <button
                className="v2-simulate"
                type="button"
                onClick={() => setStopped((value) => !value)}
              >
                {stopped
                  ? t("Restore Payments", "Khôi phục Payments")
                  : t("Simulate stopping Payments", "Mô phỏng dừng Payments")}
              </button>
            </div>
            <dl className="v2-comparison" aria-live="polite">
              <div>
                <dt>{t("Before", "Trước thay đổi")}</dt>
                <dd>
                  <code>200</code> {t("Succeeded", "Thành công")}
                </dd>
              </div>
              <div data-fault={stopped}>
                <dt>{t("After", "Sau thay đổi")}</dt>
                <dd>
                  {stopped ? (
                    <>
                      <code>503</code> {t("Unavailable", "Gián đoạn")}
                    </>
                  ) : (
                    t("Awaiting simulation", "Chờ chạy mô phỏng")
                  )}
                </dd>
              </div>
            </dl>
            <p>
              {stopped
                ? t(
                    "Orders cannot authorize payment. Gateway returns 503. Inventory stays available.",
                    "Orders không xác thực được thanh toán. Gateway trả 503. Inventory vẫn sẵn sàng.",
                  )
                : t(
                    "The example isolates one change to a dependency: Payments.",
                    "Ví dụ chỉ thay đổi một phụ thuộc là Payments.",
                  )}
            </p>
          </>
        )}
        {phase !== "impact" && (
          <button
            type="button"
            className="v2-next"
            onClick={() => {
              const next = phase === "source" ? "trace" : "impact";
              setPhase(next);
              document.getElementById(`v2-phase-${next}`)?.focus();
            }}
          >
            {phase === "source"
              ? t("Follow the trace", "Theo dõi trace")
              : t("Compare impact", "So sánh tác động")}
            <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
