import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

/**
 * Design A2 idiom — ask for the address, answer the same sentence whether or
 * not it has an account (the server enumerates nothing, so neither do we).
 */
export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = async (data: ForgotFormData) => {
    setError(null);
    try {
      await apiClient.post("/auth/forgot-password", data);
      setSent(true);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setError(
        status === 429
          ? "Too many tries — wait a few minutes, then ask again."
          : "That didn’t go through. Try again in a moment.",
      );
    }
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-xl text-foreground">
          Check your inbox.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If that address has a Folio account, a reset link is on its way.
          It&rsquo;s good for an hour, and only the newest one works.
        </p>
        <Link
          to="/login"
          className="inline-block text-xs font-medium text-primary hover:text-accent-foreground"
        >
          ← Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="font-display text-xl text-foreground">
          Forgot your password?
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Enter your address and we&rsquo;ll send a link to set a new one.
        </p>
      </div>

      {error && (
        <p className="rounded-[var(--radius)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="iris@example.com"
          className="bg-card"
          autoFocus
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send the reset link"}
      </Button>

      <Link
        to="/login"
        className="inline-block text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to log in
      </Link>
    </form>
  );
}
