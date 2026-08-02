import type { Job } from "bullmq";
import type { EmailJobData, EmailJobResult } from "@starter-kit/shared";

export async function processEmailJob(
  job: Job<EmailJobData, EmailJobResult>,
): Promise<EmailJobResult> {
  // `variables` is unused until a provider is wired up (see the TODO below);
  // the underscore marks that as deliberate rather than an oversight.
  const { to, subject, template, variables: _variables } = job.data;

  console.info(`[email] Sending "${subject}" to ${to} (template: ${template})`);

  // TODO: integrate with your email provider (Resend, SendGrid, SES, etc.)
  // Example with Resend:
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // const { id } = await resend.emails.send({
  //   from: 'noreply@yourdomain.com',
  //   to,
  //   subject,
  //   html: renderTemplate(template, variables),
  // });

  // Simulate sending
  await new Promise((resolve) => setTimeout(resolve, 100));

  return { messageId: `mock-${Date.now()}` };
}
