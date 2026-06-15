import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Deepling — Dein persönlicher Coach',
  description:
    'Dein persönlicher Coach, der dich wirklich kennt. Stellt Fragen, die jeder andere übersieht. Auf dein Profil zugeschnitten.',
  applicationName: 'Deepling',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Deepling — Dein persönlicher Coach',
    description:
      'Dein persönlicher Coach, der dich wirklich kennt. Stellt Fragen, die jeder andere übersieht.',
    locale: 'de_DE',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#f8f9fb',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
