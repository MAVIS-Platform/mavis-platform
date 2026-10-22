"use client";
import { FlowFrame } from "@/components/mainflow/shell";
import { ModelFlow } from "@/components/mainflow/model-flow";
export default function Page() {
  return (
    <FlowFrame title="Architecture Graph">
      <ModelFlow mode="architecture" />
    </FlowFrame>
  );
}
