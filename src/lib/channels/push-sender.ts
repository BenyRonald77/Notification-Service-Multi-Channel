export async function sendPush(recipient: string, body: string) {
  if (recipient.startsWith("fail-")) {
    throw new Error(`Gagal mengirim push notification ke ${recipient} (simulasi kegagalan)`);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { provider: "mock-push", recipient, body };
}
