import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit читает свои data-файлы (.afm) с диска — бандлинг webpack ломает
  // пути; пакет остаётся внешним и резолвится из node_modules в runtime.
  serverExternalPackages: ["pdfkit", "xlsx"],
  experimental: {
    serverActions: {
      // загрузка файлов пациента (лимит файла 10 MB + multipart-оверхед)
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
