"use client";
import { FlowFrame } from "@/components/mainflow/shell";
import { ImportFlow } from "@/components/mainflow/import-flow";
export default function ImportPage() {
  return (
    <FlowFrame title="Import & Analyze">
      <ImportFlow />
    </FlowFrame>
  );
}
