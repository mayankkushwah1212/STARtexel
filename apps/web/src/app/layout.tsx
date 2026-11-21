import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Startexel Web',
  description: 'Next.js frontend for Startexel monorepo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
