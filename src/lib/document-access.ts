import { prisma } from "@/lib/prisma";
import type { DocumentPasswordGrant, SecurityPolicy, User, Workspace } from "@prisma/client";

export const DOCUMENT_ACCESS_GLOBAL = "GLOBAL";
export const DOCUMENT_ACCESS_PASSWORD_SCOPED = "PASSWORD_SCOPED";
export const ACCESS_ROLE_WEB_VIEWER = "WEB_VIEWER";
export const ACCESS_ROLE_DESKTOP_SCANNER = "DESKTOP_SCANNER";

type RequestUser = Pick<User, "id" | "name" | "email" | "role" | "isActive" | "accessRole" | "documentAccessMode">;

export type PasswordCredentialOption = {
  credentialKey: string;
  workspaceId: string;
  workspaceName: string;
  sourceType: "DEFAULT" | "POLICY";
  label: string;
  securityPolicyId: string | null;
  policyType: string | null;
  priority: number;
};

export type CandidatePassword = {
  password: string;
  sourceType: "DEFAULT" | "POLICY";
  label: string;
  policyId: string | null;
  policyType: string | null;
  priority: number;
};

export function defaultCredentialKey(workspaceId: string) {
  return `DEFAULT:${workspaceId}`;
}

export function policyCredentialKey(workspaceId: string, policyId: string) {
  return `POLICY:${workspaceId}:${policyId}`;
}

export async function getActiveRequestUser(userId: string): Promise<RequestUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      accessRole: true,
      documentAccessMode: true,
    },
  });
}

export function canUseWebDocuments(user: RequestUser) {
  return user.role === "ADMIN" || user.accessRole === ACCESS_ROLE_WEB_VIEWER;
}

export async function getAccessibleWorkspaces(user: RequestUser) {
  if (user.role === "ADMIN") {
    return prisma.workspace.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        cloudPath: true,
        cloudFolderId: true,
        cloudRefreshToken: true,
      },
    });
  }

  return prisma.workspace.findMany({
    where: {
      users: {
        some: { id: user.id },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cloudPath: true,
      cloudFolderId: true,
      cloudRefreshToken: true,
    },
  });
}

export async function getAuthorizedWorkspace(user: RequestUser, workspaceId: string) {
  const where =
    user.role === "ADMIN"
      ? { id: workspaceId }
      : {
          id: workspaceId,
          users: {
            some: { id: user.id },
          },
        };

  return prisma.workspace.findFirst({
    where,
    include: {
      policies: true,
    },
  });
}

export async function getPasswordOptionsForWorkspaces(workspaceIds: string[]) {
  const uniqueWorkspaceIds = [...new Set(workspaceIds.filter(Boolean))];
  if (uniqueWorkspaceIds.length === 0) return [];

  const [workspaces, policies] = await Promise.all([
    prisma.workspace.findMany({
      where: { id: { in: uniqueWorkspaceIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.securityPolicy.findMany({
      where: {
        OR: [{ workspaceId: null }, { workspaceId: { in: uniqueWorkspaceIds } }],
      },
      orderBy: [{ type: "desc" }, { priority: "desc" }, { target: "asc" }],
      select: {
        id: true,
        type: true,
        target: true,
        priority: true,
        workspaceId: true,
      },
    }),
  ]);

  const options: PasswordCredentialOption[] = [];

  for (const workspace of workspaces) {
    options.push({
      credentialKey: defaultCredentialKey(workspace.id),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      sourceType: "DEFAULT",
      label: `Predeterminada de ${workspace.name}`,
      securityPolicyId: null,
      policyType: null,
      priority: -1,
    });

    for (const policy of policies) {
      if (policy.workspaceId && policy.workspaceId !== workspace.id) continue;

      options.push({
        credentialKey: policyCredentialKey(workspace.id, policy.id),
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        sourceType: "POLICY",
        label: `${policy.type}: ${policy.target} (${workspace.name})`,
        securityPolicyId: policy.id,
        policyType: policy.type,
        priority: policy.priority,
      });
    }
  }

  return options.sort(sortCredentialOptions);
}

export async function buildGrantDataFromKeys(userId: string, workspaceIds: string[], credentialKeys: string[]) {
  const allowedOptions = await getPasswordOptionsForWorkspaces(workspaceIds);
  const allowedByKey = new Map(allowedOptions.map(option => [option.credentialKey, option]));
  const uniqueKeys = [...new Set(credentialKeys.filter(Boolean))];

  return uniqueKeys
    .map(key => allowedByKey.get(key))
    .filter((option): option is PasswordCredentialOption => Boolean(option))
    .map(option => ({
      userId,
      workspaceId: option.workspaceId,
      securityPolicyId: option.securityPolicyId,
      credentialKey: option.credentialKey,
      sourceType: option.sourceType,
      label: option.label,
    }));
}

export async function replaceUserPasswordGrants(userId: string, workspaceIds: string[], credentialKeys: string[]) {
  const grantData = await buildGrantDataFromKeys(userId, workspaceIds, credentialKeys);

  await prisma.$transaction([
    prisma.documentPasswordGrant.deleteMany({ where: { userId } }),
    ...(grantData.length > 0
      ? [
          prisma.documentPasswordGrant.createMany({
            data: grantData,
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

export async function getCandidatePasswordsForUser(user: RequestUser, workspace: Workspace) {
  const policies = await prisma.securityPolicy.findMany({
    where: {
      OR: [{ workspaceId: null }, { workspaceId: workspace.id }],
    },
    orderBy: [{ priority: "desc" }, { target: "asc" }],
  });

  if (user.role === "ADMIN" || user.documentAccessMode === DOCUMENT_ACCESS_GLOBAL) {
    return dedupeCandidates([
      ...policies.map(policyToCandidate),
      workspaceToCandidate(workspace),
    ]).sort(sortCandidates);
  }

  const grants = await prisma.documentPasswordGrant.findMany({
    where: {
      userId: user.id,
      workspaceId: workspace.id,
    },
    include: {
      securityPolicy: true,
      workspace: true,
    },
  });

  return dedupeCandidates(grantsToCandidates(grants)).sort(sortCandidates);
}

export async function getUploadCredentialForUser(user: RequestUser, workspace: Workspace, credentialKey: string | null) {
  const options = await getPasswordOptionsForWorkspaces([workspace.id]);
  const fallbackKey = defaultCredentialKey(workspace.id);
  const requestedKey = credentialKey || fallbackKey;
  const selectedOption = options.find(option => option.credentialKey === requestedKey);

  if (!selectedOption) return null;

  if (user.role !== "ADMIN" && user.documentAccessMode !== DOCUMENT_ACCESS_GLOBAL) {
    const grant = await prisma.documentPasswordGrant.findUnique({
      where: {
        userId_credentialKey: {
          userId: user.id,
          credentialKey: selectedOption.credentialKey,
        },
      },
    });

    if (!grant) return null;
  }

  if (selectedOption.sourceType === "DEFAULT") {
    return {
      password: workspace.defaultPassword,
      label: selectedOption.label,
      sourceType: selectedOption.sourceType,
      policyId: null,
    };
  }

  const policy = await prisma.securityPolicy.findFirst({
    where: {
      id: selectedOption.securityPolicyId || "",
      OR: [{ workspaceId: null }, { workspaceId: workspace.id }],
    },
  });

  if (!policy) return null;

  return {
    password: policy.password,
    label: selectedOption.label,
    sourceType: selectedOption.sourceType,
    policyId: policy.id,
  };
}

function workspaceToCandidate(workspace: Pick<Workspace, "defaultPassword" | "id" | "name">): CandidatePassword {
  return {
    password: workspace.defaultPassword,
    sourceType: "DEFAULT",
    label: `Espacio: ${workspace.name}`,
    policyId: null,
    policyType: null,
    priority: -1,
  };
}

function policyToCandidate(policy: Pick<SecurityPolicy, "id" | "password" | "type" | "target" | "priority">): CandidatePassword {
  return {
    password: policy.password,
    sourceType: "POLICY",
    label: `${policy.type}: ${policy.target}`,
    policyId: policy.id,
    policyType: policy.type,
    priority: policy.priority,
  };
}

function grantsToCandidates(
  grants: Array<DocumentPasswordGrant & { securityPolicy: SecurityPolicy | null; workspace: Workspace }>
) {
  return grants
    .map(grant => {
      if (grant.sourceType === "DEFAULT") {
        return workspaceToCandidate(grant.workspace);
      }

      if (grant.securityPolicy) {
        return policyToCandidate(grant.securityPolicy);
      }

      return null;
    })
    .filter((candidate): candidate is CandidatePassword => Boolean(candidate));
}

function dedupeCandidates(candidates: CandidatePassword[]) {
  const byPassword = new Map<string, CandidatePassword>();

  for (const candidate of candidates) {
    if (!candidate.password) continue;
    const existing = byPassword.get(candidate.password);
    if (!existing || sortCandidates(candidate, existing) < 0) {
      byPassword.set(candidate.password, candidate);
    }
  }

  return [...byPassword.values()];
}

function sortCredentialOptions(a: PasswordCredentialOption, b: PasswordCredentialOption) {
  if (a.workspaceName !== b.workspaceName) return a.workspaceName.localeCompare(b.workspaceName);
  return sortByPolicyPriority(a.policyType, a.priority, b.policyType, b.priority);
}

function sortCandidates(a: CandidatePassword, b: CandidatePassword) {
  return sortByPolicyPriority(a.policyType, a.priority, b.policyType, b.priority);
}

function sortByPolicyPriority(aType: string | null, aPriority: number, bType: string | null, bPriority: number) {
  const typeRank = (type: string | null) => {
    if (type === "VISUAL") return 0;
    if (type === "SEMANTIC") return 1;
    return 2;
  };

  const rankDiff = typeRank(aType) - typeRank(bType);
  if (rankDiff !== 0) return rankDiff;
  return bPriority - aPriority;
}
