import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import { Wrap } from '@/components/page';
import './globals.css';

/*
 * Nunito: chữ bo tròn, thân thiện, và có bộ dấu tiếng Việt đầy đủ.
 * next/font tải về lúc BUILD rồi self-host, nên lúc chạy không có request nào
 * ra Google — hợp với CSP `default-src 'self'` và không rò dữ liệu người dùng.
 */
const nunito = Nunito({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-nunito',
});

export const metadata: Metadata = {
  title: 'KidoGame — Sân chơi game Scratch của các bé',
  description: 'Nơi các bé đăng tải và chia sẻ game Scratch tự làm.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={nunito.variable}>
      <body className="font-[family-name:var(--font-nunito)] antialiased">
        <header className="bg-ink py-3 text-white">
          <Wrap className="flex items-center justify-between gap-4">
            <Link href="/" className="text-xl font-extrabold tracking-tight no-underline">
              Kido<span className="text-accent">Game</span>
            </Link>
            <SiteNav />
          </Wrap>
        </header>
        <main>
          <Wrap>{children}</Wrap>
        </main>
      </body>
    </html>
  );
}
