import Link from 'next/link'
import { LogoMark } from '@/components/Logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col">
      <header className="px-5 pt-6 max-w-md w-full mx-auto flex flex-col items-center text-center">
        <Link
          href="/"
          className="flex flex-col items-center gap-2.5 hover:opacity-90 transition-opacity"
          aria-label="Deepling Startseite"
        >
          <LogoMark size={56} strokeWidth={2.6} />
          <span className="font-semibold text-xl tracking-tight">
            Deepling
          </span>
        </Link>
      </header>
      <div className="flex-1 px-5 pb-10 max-w-md w-full mx-auto flex flex-col justify-center">
        {children}
      </div>
    </main>
  )
}
