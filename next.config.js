/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // WO-15(2026-06-28): exceljs는 서버 export 경로에서만 동적 import하는 Node 라이브러리다.
  // 번들링하지 않고 node_modules에서 그대로 resolve하도록 외부 패키지로 둔다.
  serverExternalPackages: ["exceljs"],
};

export default config;
