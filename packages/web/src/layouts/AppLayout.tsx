import { Outlet } from "react-router-dom";
import { TopNav } from "../components/layout/TopNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="mx-auto w-full max-w-[84rem] flex-1 px-12 py-10">
        <Outlet />
      </main>
    </div>
  );
}
