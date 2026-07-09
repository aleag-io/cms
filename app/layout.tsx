import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/components/providers/query-provider";
import { DevPerformancePatch } from "@/components/providers/dev-performance-patch";

export const metadata: Metadata = {
  title: "Mar Thoma Church Management System",
  description: "Tenant-secure church management for parishes and the diocese",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", "font-sans")}>
      <body className="min-h-full flex flex-col">
        <DevPerformancePatch />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
