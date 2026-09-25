import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notification Service Multi-Channel",
  description: "Satu API notifikasi email/WhatsApp/push lewat antrean BullMQ dengan retry & dead letter queue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
