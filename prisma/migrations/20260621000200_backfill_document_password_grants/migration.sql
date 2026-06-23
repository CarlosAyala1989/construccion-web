INSERT INTO `DocumentPasswordGrant` (
  `id`,
  `userId`,
  `workspaceId`,
  `securityPolicyId`,
  `credentialKey`,
  `sourceType`,
  `label`,
  `createdAt`
)
SELECT
  UUID(),
  uw.`A`,
  uw.`B`,
  NULL,
  CONCAT('DEFAULT:', uw.`B`),
  'DEFAULT',
  CONCAT('Predeterminada de ', w.`name`),
  CURRENT_TIMESTAMP(3)
FROM `_UserWorkspaces` uw
INNER JOIN `User` u ON u.`id` = uw.`A`
INNER JOIN `Workspace` w ON w.`id` = uw.`B`
WHERE u.`role` <> 'ADMIN'
  AND u.`documentAccessMode` = 'PASSWORD_SCOPED'
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentPasswordGrant` existingGrant
    WHERE existingGrant.`userId` = uw.`A`
      AND existingGrant.`credentialKey` = CONCAT('DEFAULT:', uw.`B`)
  );
