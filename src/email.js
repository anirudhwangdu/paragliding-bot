import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendConfirmationEmail(to, subject, htmlBody) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to,
      subject,
      html: htmlBody,
    });
  } catch (err) {
    console.error("Failed to send email:", err.message);
  }
}