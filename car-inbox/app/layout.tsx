import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto-inbox op kenteken",
  description:
    "Help of waarschuw de bestuurder van een auto — met geverifieerde accounts en per bericht de keuze om je naam te tonen of anoniem te blijven.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
