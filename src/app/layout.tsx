import "@radix-ui/themes/styles.css";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Geotechnical Core Logging",
  description: "Core logging, QA, and section interpretation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, height: "100vh", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
