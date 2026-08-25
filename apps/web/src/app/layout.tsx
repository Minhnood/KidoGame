import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'KidoGame — Sân chơi game Scratch của các bé',
  description: 'Nơi các bé đăng tải và chia sẻ game Scratch tự làm.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="logo">
              Kido<span>Game</span>
            </Link>
            <Link href="/upload" className="btn">
              Đăng game
            </Link>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
