import type { Metadata } from "next";
import {NuqsAdapter} from "nuqs/adapters/next"
import { TRPCReactProvider } from "@/trpc/client";

import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/modules/auth/ui/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { SpeedInsights } from "@vercel/speed-insights/next"
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});



export const metadata: Metadata = {
  title: "Meet.AI",
  description: "Built to assist meetings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {


  return (
    <>
    <NuqsAdapter>
    <AuthProvider>
    <TRPCReactProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.className}  antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange={false}
          >
            <Toaster/>
            {children}
            <SpeedInsights />
          </ThemeProvider>
        </body>
      </html>
    </TRPCReactProvider>
    </AuthProvider>
    </NuqsAdapter></>
  );
}
