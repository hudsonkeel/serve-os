import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
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
    <div className="flex min-h-screen bg-ivory">
      <Sidebar currentUser={currentUser} />
      <div className="ml-64 flex flex-1 flex-col">
        <TopNav title={title} currentUser={currentUser} />
        <main className="flex-1 overflow-auto px-10 py-10">{children}</main>
      </div>
    </div>
  );
}
