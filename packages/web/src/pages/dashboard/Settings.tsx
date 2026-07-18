import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/button";

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await logout();
    queryClient.clear(); // don't leave this reader's data cached for the next one
    navigate("/", { replace: true });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-[2rem] leading-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account, and nothing you have to share.
        </p>
      </header>

      <section className="rounded-[var(--radius)] border border-border bg-card p-5">
        <h2 className="font-display text-lg text-foreground">Profile</h2>
        <dl className="mt-4 space-y-3">
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="text-foreground">{user?.name}</dd>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-foreground">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="capitalize text-foreground">{user?.role}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-[var(--radius)] border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg text-foreground">Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signing out ends this session on the server, not just in this
            browser.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </section>
    </div>
  );
}
