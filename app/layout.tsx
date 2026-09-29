import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { StoreProvider } from '@/lib/store';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FeedbackFlow — Surveys, Responses & Automations',
  description:
    'Create surveys, collect responses, and automate what happens next with viaSocket Embed.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
