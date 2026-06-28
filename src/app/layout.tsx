import "~/styles/globals.css";

import { type Metadata } from "next";

import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { APP_DISPLAY_NAME } from "~/lib/brand";

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: `${APP_DISPLAY_NAME} 본사 업무 시스템`,
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
