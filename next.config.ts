import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit читает свои data-файлы (.afm) с диска — бандлинг webpack ломает
  // пути; пакет остаётся внешним и резолвится из node_modules в runtime.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
