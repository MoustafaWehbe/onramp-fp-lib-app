import { Outlet } from "react-router-dom";
import { TopNav } from "../components/layout/TopNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      {/* The design's 48px gutter is a desktop measure; phones get 16px. */}
      <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
        <Outlet />
      </main>
    </div>
  );
}
