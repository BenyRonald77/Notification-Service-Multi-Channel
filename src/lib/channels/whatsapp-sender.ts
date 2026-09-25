export async function sendWhatsapp(recipient: string, body: string) {
  if (recipient.startsWith("fail-")) {
    throw new Error(`Gagal mengirim WhatsApp ke ${recipient} (simulasi kegagalan)`);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { provider: "mock-whatsapp", recipient, body };
}
