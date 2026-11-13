-- Migración SQL add user totp; se ejecuta en orden cronológico.
ALTER TABLE `User`
  ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `twoFactorSecret` TEXT NULL,
  ADD COLUMN `twoFactorConfirmedAt` DATETIME(3) NULL;
