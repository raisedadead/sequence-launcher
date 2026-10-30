import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { environment } from "@raycast/api";

export type Trace = (event: string, fields?: Record<string, unknown>) => void;

export function createTrace(): Trace {
  const invocation = randomUUID().slice(0, 8);
  const start = performance.now();
  let counter = 0;
  let ready = false;
  return (event, fields = {}) => {
    if (!environment.isDevelopment) return;
    const line = {
      invocation,
      n: counter++,
      ms: Math.round(performance.now() - start),
      at: new Date().toISOString(),
      event,
      ...fields,
    };
    try {
      if (!ready) {
        mkdirSync(environment.supportPath, { recursive: true });
        ready = true;
      }
      appendFileSync(join(environment.supportPath, "trace.jsonl"), JSON.stringify(line) + "\n");
    } catch (error) {
      console.error(error);
    }
  };
}
