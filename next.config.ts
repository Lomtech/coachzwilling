import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // microphone=(self) — NICHT auf () zurücksetzen!
          // Eine leere Liste verbietet das Mikrofon für ALLE Quellen, auch für
          // die eigene Seite. Das schaltet getUserMedia hart ab, BEVOR eine
          // Nutzer-Berechtigung greift: die Permissions-API meldet dann dauerhaft
          // "denied" und keine Chrome-Einstellung kann das überstimmen. Genau das
          // hat die Spracheingabe (Aufnahme → /api/transcribe → Text) monatelang
          // lahmgelegt — für jeden Nutzer, nicht nur lokal.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
    ]
  },
}

export default config
