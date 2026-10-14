// Copies the WebZjs package into public/webzjs so the browser loads it as
// native ES modules. Bundling it breaks its thread workers: they import the
// package by directory (`../../..`), which only bundlers resolve, and webpack
// doesn't inside workers. Those imports are pointed at the entry file here.
import {
  cpSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(
  new URL("../../packages/webzjs-wallet", import.meta.url),
);
const out = fileURLToPath(new URL("../public/webzjs", import.meta.url));

rmSync(out, { recursive: true, force: true });
cpSync(src, out, {
  recursive: true,
  filter: (p) => !/node_modules|\.d\.ts$|package\.json$|README/.test(p),
});

// Snippet folders are named by content hash, so find them by prefix.
const snippet = (prefix, rest) => {
  const dir = readdirSync(`${out}/snippets`).find((d) => d.startsWith(prefix));
  if (!dir) throw new Error(`sync-webzjs: no ${prefix}* snippet`);
  return `snippets/${dir}/${rest}`;
};
const patches = [
  [
    snippet("wasm-bindgen-rayon-", "src/workerHelpers.js"),
    "'../../..'",
    "'../../../webzjs_wallet.js'",
  ],
  [
    snippet("wasm_thread-", "src/wasm32/js/web_worker_module.bundler.js"),
    '"../../../../../"',
    '"../../../../../webzjs_wallet.js"',
  ],
];
for (const [file, from, to] of patches) {
  const path = `${out}/${file}`;
  const text = readFileSync(path, "utf8");
  if (!text.includes(from))
    throw new Error(`sync-webzjs: ${file} no longer contains ${from}`);
  writeFileSync(path, text.replace(from, to));
}
console.log("webzjs → public/webzjs");
