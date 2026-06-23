ALTER TABLE `User`
  ADD COLUMN `documentAccessMode` VARCHAR(191) NOT NULL DEFAULT 'PASSWORD_SCOPED';

CREATE TABLE `DocumentPasswordGrant` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `securityPolicyId` VARCHAR(191) NULL,
  `credentialKey` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `DocumentPasswordGrant_userId_credentialKey_key` (`userId`, `credentialKey`),
  INDEX `DocumentPasswordGrant_workspaceId_idx` (`workspaceId`),
  INDEX `DocumentPasswordGrant_securityPolicyId_idx` (`securityPolicyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DocumentPasswordGrant`
  ADD CONSTRAINT `DocumentPasswordGrant_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentPasswordGrant`
  ADD CONSTRAINT `DocumentPasswordGrant_workspaceId_fkey`
  FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentPasswordGrant`
  ADD CONSTRAINT `DocumentPasswordGrant_securityPolicyId_fkey`
  FOREIGN KEY (`securityPolicyId`) REFERENCES `SecurityPolicy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
