import React from "react"
import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: '--font-instrument'
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: '--font-instrument-serif'
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-jetbrains'
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#f7f7f5',
}

export const metadata: Metadata = {
  title: 'RAPID — Revenue Autopilot for Intelligent Payment Recovery',
  description: 'Recover lost revenue automatically. RAPID detects at-risk payments, diagnoses the root cause with AI, picks the safest highest-value action, enforces policy guardrails, executes through Razorpay, and measures every outcome with a full audit trail.',
  keywords: ['revenue recovery', 'payment recovery', 'Razorpay', 'dunning', 'AI diagnosis', 'policy engine', 'audit trail'],
  openGraph: {
    title: 'RAPID — Revenue Autopilot for Intelligent Payment Recovery',
    description: 'Recover lost revenue automatically. AI diagnosed, policy guarded, Razorpay powered.',
    url: 'https://rapid.id',
    siteName: 'RAPID',
    locale: 'en-US',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
