import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// latin-ext обязателен для азербайджанских ə, ğ, ş, ç, ö, ü, ı (DESIGN.md §3)
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dental Pro CRM",
  description: "Stomatoloji klinikalar üçün premium CRM platforması — by AV Systems",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az" className={inter.variable}>
      <body className="font-sans text-text-primary antialiased">{children}</body>
    </html>
  );
}
