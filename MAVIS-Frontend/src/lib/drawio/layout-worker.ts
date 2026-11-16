import { Worker } from "node:worker_threads";
import path from "node:path";
import type { ElkNode } from "elkjs/lib/elk-api";
let active = 0;
export function layoutInWorker(graph: ElkNode): Promise<ElkNode> {
  if (active >= 2) return Promise.reject(new Error("Diagram layout busy. Retry shortly."));
  active++;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        `const {parentPort,workerData}=require('node:worker_threads');const ELK=require(workerData.engine);new ELK().layout(workerData.graph).then(result=>parentPort.postMessage({result}),error=>parentPort.postMessage({error:String(error)}));`,
        {
          eval: true,
          workerData: {
            engine: path.join(process.cwd(), "node_modules/elkjs/lib/elk.bundled.js"),
            graph,
          },
        },
      );
    } catch (error) {
      active--;
      reject(error);
      return;
    }
    let done = false;
    const finish = (error?: unknown, result?: ElkNode) => {
      if (done) return;
      done = true;
      active--;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error("Diagram layout timed out")), 5000);
    worker.once("message", (message) =>
      finish(message.error ? new Error(message.error) : undefined, message.result),
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!done) finish(new Error(`Diagram worker stopped (${code})`));
    });
  });
}
