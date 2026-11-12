import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saidso — the voice keyboard that remembers your work',
  description:
    'Saidso remembers your work, not you. Ask about anything you have dictated and get an answer built from your own words — or an honest "you never said that".',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
