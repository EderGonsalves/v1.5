import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { OnboardingProvider } from "@/components/onboarding/onboarding-context";
import { SidebarProvider } from "@/components/sidebar/sidebar-context";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Onboarding de Atendimento",
  description: "Configuração guiada para agentes e fluxos de atendimento.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <OnboardingProvider>
          <SidebarProvider>
            <AppShell>{children}</AppShell>
          </SidebarProvider>
        </OnboardingProvider>
      </body>
    </html>
  );
}
