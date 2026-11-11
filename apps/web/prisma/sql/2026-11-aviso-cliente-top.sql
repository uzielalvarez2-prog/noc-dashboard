-- Aviso automático Cliente TOP: grupo de WhatsApp destino por cliente.
-- Aplicado vía `prisma db push`; este archivo deja constancia del cambio.
ALTER TABLE "ClienteTop" ADD COLUMN IF NOT EXISTS "notificarChatId" TEXT;
ALTER TABLE "ClienteTop" ADD COLUMN IF NOT EXISTS "notificarChatName" TEXT;
