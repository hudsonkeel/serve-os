import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { MobileHeader } from "./MobileHeader";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
}

export async function PageContainer({ children, title }: PageContainerProps) {
  const profile = await getCurrentAuthorizedUser();
  const currentUser = buildCurrentUserDisplay(profile);

  return (
    // overflow-x-hidden is a safety net, not the fix itself — the real fix
    // is the fixed sidebar being hidden (not just visually) below md: and
    // ml-64 (the sidebar's own width offset — Sidebar.tsx is w-64, 256px;
    // this must always match it exactly, or a vertical strip of bg-canvas
    // shows between the navy sidebar and the navy TopNav/content on every
    // page — a real drift bug found and fixed here, not a per-page patch)
    // only applying at md: and above. Content now uses the full phone
    // width instead of being pushed right on a viewport that's often
    // narrower than that alone.
    <div className="flex min-h-screen w-full overflow-x-hidden bg-canvas">
      <Sidebar currentUser={currentUser} />
      <div className="flex w-full min-w-0 flex-1 flex-col md:ml-64">
        <MobileHeader title={title} currentUser={currentUser} />
        <TopNav title={title} currentUser={currentUser} />
        <main className="w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
