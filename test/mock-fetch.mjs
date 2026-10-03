import { appendFileSync } from "node:fs";

if (process.env.JEV_TEST_RESPONSES) {
  const responses = JSON.parse(process.env.JEV_TEST_RESPONSES);
  let index = 0;
  globalThis.fetch = async (url, options) => {
    if (process.env.JEV_TEST_REQUEST_FILE) {
      appendFileSync(process.env.JEV_TEST_REQUEST_FILE, JSON.stringify({ url, options: { method: options.method, headers: options.headers }, body: JSON.parse(options.body) }) + "\n");
    }
    const next = responses[index++];
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status, headers: { "Content-Type": "application/json" } });
  };
}
