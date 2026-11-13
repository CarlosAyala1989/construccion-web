-- Migración SQL split user access roles; se ejecuta en orden cronológico.
ALTER TABLE `User`
  ADD COLUMN `accessRole` VARCHAR(191) NOT NULL DEFAULT 'DESKTOP_SCANNER';

UPDATE `User`
SET `accessRole` = 'WEB_VIEWER'
WHERE `role` = 'ADMIN';
