export async function sendEmail(recipient: string, subject: string | null, body: string) {
  if (recipient.startsWith("fail-")) {
    throw new Error(`Gagal mengirim email ke ${recipient} (simulasi kegagalan)`);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { provider: "mock-email", recipient, subject, body };
}
