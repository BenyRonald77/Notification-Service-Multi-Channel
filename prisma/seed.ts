import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const apiKey = `ns_${randomBytes(24).toString("hex")}`;

  const user = await prisma.user.upsert({
    where: { email: "demo@notif.dev" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@notif.dev",
      passwordHash,
      apiKey,
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { key: "welcome-email" },
    update: {},
    create: {
      key: "welcome-email",
      channel: "EMAIL",
      subject: "Selamat datang, {{name}}!",
      bodyTemplate: "Halo {{name}}, terima kasih telah mendaftar di layanan kami.",
      ownerId: user.id,
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { key: "otp-whatsapp" },
    update: {},
    create: {
      key: "otp-whatsapp",
      channel: "WHATSAPP",
      bodyTemplate: "Kode OTP kamu adalah {{otp}}. Jangan bagikan ke siapa pun.",
      ownerId: user.id,
    },
  });

  console.log("Seed selesai. Demo user:", user.email, "| password: password123");
  console.log("API key:", apiKey);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
