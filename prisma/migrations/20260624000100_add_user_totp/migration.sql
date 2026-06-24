ALTER TABLE `User`
  ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `twoFactorSecret` TEXT NULL,
  ADD COLUMN `twoFactorConfirmedAt` DATETIME(3) NULL;
