import ELK from "elkjs/lib/elk-api";
import type { ElkNode } from "elkjs/lib/elk-api";
export function layoutLocally(graph: ElkNode): Promise<ElkNode> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/api/diagram-engine/elk-worker.min.js");
    const engine = new ELK({ workerFactory: () => worker });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Local layout timed out. Try a smaller diagram."));
    }, 5000);
    engine.layout(graph).then(
      (result) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        worker.terminate();
        reject(error);
      },
    );
    worker.addEventListener("error", () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("Local layout worker failed"));
    });
  });
}
