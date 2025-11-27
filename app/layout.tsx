import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/components/auth-provider"
import { ThemeProvider } from "next-themes"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Health Tracker - Build Better Habits",
  description: "Track your daily habits, build streaks, and achieve your goals. A modern habit tracking app designed to help you transform your life one habit at a time.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html 
      lang="en" 
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
    >
      <body suppressHydrationWarning className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
          storageKey="habits-theme"
        >
          <AuthProvider>
            <Suspense 
              fallback={
                <div className="flex h-screen w-full items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  </div>
                </div>
              }
            >
              {children}
            </Suspense>
          </AuthProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
