"use client";
import { FlowFrame } from "@/components/mainflow/shell";
import { ModelFlow } from "@/components/mainflow/model-flow";
export default function Page() {
  return (
    <FlowFrame title="AI Explanation">
      <ModelFlow mode="explain" />
    </FlowFrame>
  );
}
