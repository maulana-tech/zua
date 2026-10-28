import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const rootEnv = path.join(repoRoot, ".env");
if (fs.existsSync(rootEnv)) {
  const lines = fs.readFileSync(rootEnv, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

const localBuild = process.env.APP_BUILD_TARGET === "local";
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Cross-origin isolation lets the Zcash wallet (WebZjs) prove on several
    // threads. Only the signed-in app routes (and /verify, which checks
    // receipts with it) get it: login (Privy) happens on public pages, which
    // stay unisolated.
    //
    // WebKit (Safari, and every browser on iOS) never implements
    // `credentialless`: there only `require-corp` isolates the document. Get
    // it wrong and SharedArrayBuffer stays unavailable, so the wallet's
    // worker hand-off throws "The object can not be cloned". Chrome, Edge,
    // Firefox and Arc keep `credentialless` so the Privy iframe (which sends
    // no Cross-Origin-Resource-Policy) still loads.
    const isolation = (coep) => [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: coep },
    ];
    const webkitUA = ".*(CriOS|FxiOS|EdgiOS|OPiOS|Version/[0-9.]+ Safari/).*";
    const webkit = { type: "header", key: "user-agent", value: webkitUA };
    const appRoutes = [
      "dashboard",
      "send",
      "payroll",
      "history",
      "links",
      "invoices",
      "requests",
      "settings",
      "verify",
      "claim",
      "claims",
      "developers",
      "pos",
    ];
    // Only /embed/* may be framed by other sites (public/embed.js). Every
    // other page refuses, so it can't be used for clickjacking.
    const noFraming = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ];
    return [
      {
        source: "/((?!embed/|embed.js|webzjs/|sw.js).*)",
        headers: noFraming,
      },
      {
        source: "/embed.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=300" }],
      },
      ...appRoutes.flatMap((route) => [
        {
          source: `/${route}`,
          has: [webkit],
          headers: isolation("require-corp"),
        },
        {
          source: `/${route}`,
          missing: [webkit],
          headers: isolation("credentialless"),
        },
        {
          source: `/${route}/:path*`,
          has: [webkit],
          headers: isolation("require-corp"),
        },
        {
          source: `/${route}/:path*`,
          missing: [webkit],
          headers: isolation("credentialless"),
        },
      ]),
      // Wallet workers (public/webzjs) must carry the same COEP as the page:
      // a document isolated with require-corp refuses a worker served with
      // credentialless ("Worker load was blocked by COEP").
      {
        source: "/webzjs/:path*",
        has: [webkit],
        headers: isolation("require-corp"),
      },
      {
        source: "/webzjs/:path*",
        missing: [webkit],
        headers: isolation("credentialless"),
      },
      {
        source: "/i/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/dashboard/links",
        destination: "/links",
        permanent: true,
      },
      { source: "/withdraw", destination: "/send", permanent: false },
      {
        source: "/dashboard/history",
        destination: "/history",
        permanent: true,
      },
    ];
  },
  // Emit a self-contained server bundle for the Docker runtime image. Combined
  // with outputFileTracingRoot (the monorepo root), the standalone output lands
  // at web/.next/standalone/web/server.js with node_modules traced from the
  // repo root — see the Dockerfile runner stage.
  output: localBuild ? undefined : "standalone",
  distDir: localBuild ? ".next-local" : ".next",
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  // mongodb pulls in optional native drivers that webpack can't statically
  // bundle for the Node.js server runtime — require it from node_modules.
  serverExternalPackages: ["mongodb"],
  webpack: (config, { dev }) => {
    // The wallet WASM (~60 MB) bloats Next's persistent filesystem cache. In
    // dev, use an in-memory cache so nothing accumulates on disk.
    if (dev) {
      config.cache = { type: "memory" };
    }

    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@farcaster/mini-app-solana": false,
    };

    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@farcaster\/mini-app-solana/ },
      { module: /@privy-io\/react-auth/ },
      /Critical dependency: the request of a dependency is an expression/,
    ];

    return config;
  },
};

export default nextConfig;
