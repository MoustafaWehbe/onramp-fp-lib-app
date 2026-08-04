import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "At least 8 characters.")
      .regex(/[A-Z]/, "Needs an uppercase letter.")
      .regex(/[0-9]/, "Needs a number."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The passwords don't match.",
  });

type ResetFormData = z.infer<typeof resetSchema>;

/**
 * Design A2 idiom — the landing page for the emailed link. A bad, reused, or
 * expired token gets one flat message and a way to ask for a fresh link; a
 * successful reset signs every session out, so the only path onward is log in.
 */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  const onSubmit = async (data: ResetFormData) => {
    setError(null);
    try {
      await apiClient.post("/auth/reset-password", {
        token,
        password: data.password,
      });
      setDone(true);
    } catch (err) {
      const resp = (
        err as {
          response?: {
            status?: number;
            data?: { errors?: { field?: string; message?: string }[] };
          };
        }
      ).response;
      // A 422 is the validator speaking — and it can be about the PASSWORD
      // (fixable here) or the token's shape (a broken link). Only the latter
      // deserves the invalid-link message.
      const passwordProblem =
        resp?.status === 422
          ? resp.data?.errors?.find((e) => e.field === "password")?.message
          : undefined;
      setError(
        passwordProblem ??
          (resp?.status === 400 || resp?.status === 422
            ? "That reset link is invalid or has expired. Ask for a new one below."
            : resp?.status === 429
              ? "Too many tries — wait a few minutes, then try again."
              : "That didn’t go through. Try again in a moment."),
      );
    }
  };

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-xl text-foreground">
          This link is incomplete.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A reset link carries its own key — open the link from the email
          exactly as it arrived, or ask for a fresh one.
        </p>
        <Link
          to="/forgot-password"
          className="inline-block text-xs font-medium text-primary hover:text-accent-foreground"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-xl text-foreground">
          Password changed.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every signed-in session was signed out, including this one. Log in
          with the new password — you&rsquo;re the only one who has it.
        </p>
        <Link
          to="/login"
          className="inline-block text-xs font-medium text-primary hover:text-accent-foreground"
        >
          Log in →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="font-display text-xl text-foreground">
          Set a new password.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          At least 8 characters, with an uppercase letter and a number.
        </p>
      </div>

      {error && (
        <div className="space-y-1.5 rounded-[var(--radius)] bg-destructive/10 px-3 py-2.5">
          <p className="text-sm text-destructive">{error}</p>
          <Link
            to="/forgot-password"
            className="inline-block text-xs font-medium text-primary hover:text-accent-foreground"
          >
            Request a new link
          </Link>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••••"
          className="bg-card"
          autoFocus
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Repeat it</Label>
        <Input
          id="confirm"
          type="password"
          placeholder="••••••••••"
          className="bg-card"
          {...register("confirm")}
        />
        {errors.confirm && (
          <p className="text-xs text-destructive">{errors.confirm.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Change the password"}
      </Button>
    </form>
  );
}
