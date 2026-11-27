"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Box,
  CodeXml,
  GitFork,
  Pause,
  Play,
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
  { id: "trace", icon: Activity, en: "OTel Trace", vi: "Trace (OTel)" },
  { id: "impact", icon: GitFork, en: "Change Impact", vi: "Tác động" },
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

  function toggleFault() {
    setStopped((prev) => {
      const next = !prev;
      if (next) {
        select("Payments");
        setPhase("impact");
      }
      return next;
    });
  }

  return (
    <section
      className="v2-console"
      id="demo"
      tabIndex={-1}
      aria-labelledby="v2-demo-title"
      data-fault={stopped}
    >
      <div className="v2-console-head">
        <div className="v2-console-title">
          <span className="v2-live-dot" data-fault={stopped} aria-hidden="true" />
          <div>
            <h2 id="v2-demo-title">
              {t("Interactive fault explorer", "Mô phỏng tương tác kiến trúc")}
            </h2>
            <p>
              {t("Click a service or pause Payments", "Chọn service hoặc tạm dừng Payments")}
            </p>
          </div>
        </div>
        <div className="v2-console-tools">
          <button
            type="button"
            className="v2-fault-toggle"
            data-fault={stopped}
            onClick={toggleFault}
          >
            {stopped ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {stopped ? t("Restore", "Khôi phục") : t("Pause Payments", "Dừng Payments")}
          </button>
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
      </div>

      <div className="v2-request-row">
        <code>{request}</code>
        <span className="v2-request-status" data-fault={stopped} role="status">
          <span aria-hidden="true" />
          {stopped
            ? t("503 · 100% err · PAUSED", "503 · 100% lỗi · TẠM DỪNG")
            : t("200 · 184ms · 0% err", "200 · 184ms · 0% lỗi")}
        </span>
      </div>

      <div
        className="v2-topology"
        role="group"
        aria-label={t("Inspect a service", "Xem chi tiết dịch vụ")}
      >
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(({ from, to, path }) => {
            const isFaultEdge = stopped && to !== "Inventory";
            const isRelated = from === selected || to === selected;
            return (
              <g key={to}>
                <path
                  d={path}
                  className="v2-edge-base"
                  vectorEffect="non-scaling-stroke"
                  data-related={isRelated}
                  data-fault={isFaultEdge}
                />
                {(isRelated || isFaultEdge || !stopped) && (
                  <path
                    d={path}
                    className="mavis-packet-edge v2-edge-flow"
                    vectorEffect="non-scaling-stroke"
                    data-related={isRelated}
                    data-fault={isFaultEdge}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {serviceNames.map((name) => {
          const Icon = serviceIcons[name];
          const { x, y } = services[name];
          const isStoppedNode = stopped && name === "Payments";
          const isUpstreamImpacted = stopped && (name === "Orders" || name === "Gateway");
          return (
            <button
              key={name}
              type="button"
              className="v2-service"
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-pressed={selected === name}
              onClick={() => select(name)}
              data-stopped={isStoppedNode}
              data-impacted={isUpstreamImpacted}
            >
              <span className="v2-service-dot" aria-hidden="true" />
              <Icon aria-hidden="true" />
              <span>{name}</span>
              {isStoppedNode && <em className="v2-node-tag">PAUSED</em>}
              {isUpstreamImpacted && <em className="v2-node-tag">503</em>}
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

      <div className="v2-evidence" key={`${phase}-${selected}-${stopped}`}>
        {phase === "source" && (
          <div className="v2-panel-fade">
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
                    "Select Orders to inspect the exact source calls wiring these services.",
                    "Chọn Orders để xem chính xác dòng mã nguồn tạo các kết nối này.",
                  )}
            </p>
          </div>
        )}
        {phase === "trace" && (
          <div className="v2-panel-fade">
            <div className="v2-panel-head">
              <h3>
                {stopped
                  ? t("Baseline OTel trace (before fault)", "Trace OTel nền (trước sự cố)")
                  : t("Distributed OpenTelemetry trace", "Trace phân tán OpenTelemetry")}
              </h3>
              <code>0–184 ms</code>
            </div>
            <ul
              className="v2-spans"
              aria-label={t("Spans in request order", "Các span theo thứ tự yêu cầu")}
            >
              {serviceNames.map((name, idx) => {
                const span = services[name];
                const spanFault = stopped && (name === "Payments" || name === "Orders" || name === "Gateway");
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
                          className="v2-bar-grow"
                          data-fault={spanFault}
                          style={{
                            insetInlineStart: `${span.start / 1.84}%`,
                            inlineSize: `${span.duration / 1.84}%`,
                            animationDelay: `${idx * 55}ms`,
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
          </div>
        )}
        {phase === "impact" && (
          <div className="v2-panel-fade">
            <div className="v2-panel-head">
              <h3>{t("Reverse BFS blast radius", "Phạm vi lan truyền (Reverse BFS)")}</h3>
              <button
                className="v2-simulate"
                type="button"
                data-fault={stopped}
                onClick={() => setStopped((value) => !value)}
              >
                {stopped
                  ? t("Restore Payments", "Khôi phục Payments")
                  : t("Simulate stopping Payments", "Mô phỏng dừng Payments")}
              </button>
            </div>
            <dl className="v2-comparison" aria-live="polite">
              <div>
                <dt>{t("Before", "Trước thao tác")}</dt>
                <dd>
                  <code>200</code> {t("184ms · 0% err", "184ms · 0% lỗi")}
                </dd>
              </div>
              <div data-fault={stopped}>
                <dt>{t("After", "Sau thao tác")}</dt>
                <dd>
                  {stopped ? (
                    <>
                      <code>503</code> {t("Gateway & Orders fail", "Gateway & Orders lỗi")}
                    </>
                  ) : (
                    t("Ready — pause Payments to compare", "Sẵn sàng — dừng Payments để đối chiếu")
                  )}
                </dd>
              </div>
            </dl>
            <p>
              {stopped
                ? t(
                    "Orders fails payment authorization and propagates 503 to Gateway. Inventory remains healthy and isolated.",
                    "Orders không xác thực được thanh toán và đẩy lỗi 503 lên Gateway. Inventory vẫn khỏe mạnh, hoàn toàn cô lập.",
                  )
                : t(
                    "In MAVIS Studio Live, students lock their blast-radius prediction before running this on real Docker containers.",
                    "Trong MAVIS Studio Live, sinh viên khóa dự đoán phạm vi ảnh hưởng trước khi chạy lệnh trên container Docker thật.",
                  )}
            </p>
          </div>
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
              ? t("Inspect OTel trace", "Xem Trace OpenTelemetry")
              : t("Run Change Impact", "Thử phân tích Tác động")}
            <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
