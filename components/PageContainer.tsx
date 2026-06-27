import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
}

export function PageContainer({ children, title }: PageContainerProps) {
  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar />
      <div className="ml-64 flex flex-1 flex-col">
        <TopNav title={title} />
        <main className="flex-1 overflow-auto px-10 py-10">{children}</main>
      </div>
    </div>
  );
}
