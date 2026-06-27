import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit читает свои data-файлы (.afm) с диска — бандлинг webpack ломает
  // пути; пакет остаётся внешним и резолвится из node_modules в runtime.
  serverExternalPackages: ["pdfkit", "xlsx"],
  // PDF-шрифты (assets/fonts/, lib/pdf.ts) читаются по runtime-пути внутри
  // pdfkit — automatic file-tracing Vercel такую динамическую строку не
  // видит и может не включить .ttf в бандл serverless-функции (сессия 97,
  // см. assets/fonts/README.md). Явно объявлено для всех маршрутов.
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**"],
  },
  experimental: {
    serverActions: {
      // загрузка файлов пациента (лимит файла 10 MB + multipart-оверхед)
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
