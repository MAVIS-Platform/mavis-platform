"use client";
import { useState } from "react";
import type { Evidence } from "@/types/domain";
import { sourceLabel, shortLocator } from "./three-e-content";
import { Button } from "@/components/ui/button";
export function ThreeEEvidence({ evidence }: { evidence: readonly Evidence[] }) {
  const [limit, setLimit] = useState(5);
  if (!evidence.length)
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        Chưa có đoạn bằng chứng gắn với lựa chọn này. Các quan hệ trong mô hình vẫn có thể tồn tại;
        cần kiểm tra nguồn hoặc phân tích lại nếu thiếu dữ liệu.
      </p>
    );
  return (
    <div className="min-w-0 max-w-full space-y-3 [overflow-wrap:anywhere]">
      {evidence.slice(0, limit).map((item) => (
        <article key={item.id} className="min-w-0 rounded-lg border p-3">
          <p className="text-xs font-medium">{sourceLabel(item)}</p>
          <p className="mt-2 text-sm">
            {sourceLabel(item) === "Từ cấu hình"
              ? "Khai báo cấu hình liên quan; chưa chứng minh tương tác đã chạy."
              : sourceLabel(item) === "Quan sát khi chạy"
                ? "Bản ghi runtime gắn với lựa chọn này; cần đối chiếu phiên quan sát."
                : "Đoạn nguồn được gắn với lựa chọn này; cần đọc trong ngữ cảnh để xác minh nhận định."}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer break-words text-sm text-primary">
              {shortLocator(item.location)}
            </summary>
            {item.snippet.trim() ? (
              <pre className="mt-3 max-h-72 min-w-0 max-w-full overflow-auto rounded-md bg-muted p-3 text-xs leading-6">
                <code>{item.snippet}</code>
              </pre>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Đoạn trích chưa có nội dung.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {item.complete === true
                ? "Nguồn báo cáo đoạn trích đầy đủ; vẫn cần đối chiếu nhận định."
                : item.complete === false
                  ? "Đoạn trích chưa đầy đủ."
                  : "Độ đầy đủ của đoạn trích chưa được xác nhận."}
            </p>
          </details>
        </article>
      ))}
      {evidence.length > limit && (
        <Button size="sm" variant="outline" onClick={() => setLimit(limit + 5)}>
          Xem thêm bằng chứng ({evidence.length - limit})
        </Button>
      )}
    </div>
  );
}
