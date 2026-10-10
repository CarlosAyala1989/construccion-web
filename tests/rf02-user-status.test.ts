import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import {
  AccountStatusError,
  changeUserAccountStatus,
  getAccountStatusAuditAction,
  getAccountStatusMessage,
  parseAccountStatusPayload,
} from "../src/lib/user-status";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

type TestTransaction = {
  user: {
    findUnique: (args: { where: { id: string } }) => Promise<TestUser | null>;
    update: (args: { where: { id: string }; data: { isActive: boolean } }) => Promise<TestUser>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<void>;
  };
};

function createTransactionFixture(initialUsers: TestUser[]) {
  const users = new Map(initialUsers.map(user => [user.id, { ...user }]));
  const auditEntries: Array<Record<string, unknown>> = [];
  const transaction: TestTransaction = {
    user: {
      findUnique: async ({ where }) => users.get(where.id) ?? null,
      update: async ({ where, data }) => {
        const currentUser = users.get(where.id);
        if (!currentUser) throw new Error("El usuario de prueba no existe.");

        const updatedUser = { ...currentUser, isActive: data.isActive };
        users.set(where.id, updatedUser);
        return updatedUser;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        auditEntries.push(data);
      },
    },
  };

  return { users, auditEntries, transaction };
}

function replacePrismaTransaction(transaction: TestTransaction) {
  const client = prisma as unknown as {
    $transaction: (callback: (transaction: TestTransaction) => Promise<unknown>) => Promise<unknown>;
  };
  const originalTransaction = client.$transaction;
  client.$transaction = callback => callback(transaction);

  return () => {
    client.$transaction = originalTransaction;
  };
}

function createUser(id: string, role = "EMPLOYEE"): TestUser {
  return {
    id,
    name: "Operador de prueba",
    email: `${id}@example.test`,
    role,
    isActive: true,
  };
}

test("unitaria valida el cuerpo y solo admite un booleano isActive", () => {
  assert.deepEqual(parseAccountStatusPayload({ isActive: false }), {
    ok: true,
    value: { isActive: false },
  });
  assert.equal(parseAccountStatusPayload({ isActive: "false" }).ok, false);
  assert.equal(parseAccountStatusPayload({ isActive: false, name: "Otro" }).ok, false);
  assert.equal(parseAccountStatusPayload(null).ok, false);
});

test("integracion conserva la cuenta y audita la desactivacion", async () => {
  const fixture = createTransactionFixture([createUser("usuario-1")]);
  const restoreTransaction = replacePrismaTransaction(fixture.transaction);

  try {
    const result = await changeUserAccountStatus({
      actorUserId: "admin-1",
      actorUserName: "Administración",
      targetUserId: "usuario-1",
      requestedIsActive: false,
    });

    assert.equal(result.changed, true);
    assert.equal(result.user.isActive, false);
    assert.equal(fixture.users.get("usuario-1")?.id, "usuario-1");
    assert.equal(fixture.auditEntries.length, 1);
    assert.equal(fixture.auditEntries[0].action, "USER_DEACTIVATED");
  } finally {
    restoreTransaction();
  }
});

test("funcional no registra una transicion cuando la cuenta ya esta desactivada", async () => {
  const fixture = createTransactionFixture([{ ...createUser("usuario-2"), isActive: false }]);
  const restoreTransaction = replacePrismaTransaction(fixture.transaction);

  try {
    const result = await changeUserAccountStatus({
      actorUserId: "admin-1",
      actorUserName: "Administración",
      targetUserId: "usuario-2",
      requestedIsActive: false,
    });

    assert.equal(result.changed, false);
    assert.match(result.message, /ya se encontraba desactivada/);
    assert.equal(fixture.auditEntries.length, 0);
  } finally {
    restoreTransaction();
  }
});

test("rendimiento procesa doscientas cincuenta transiciones simuladas", async () => {
  const fixture = createTransactionFixture(
    Array.from({ length: 250 }, (_, index) => createUser(`usuario-${index}`)),
  );
  const restoreTransaction = replacePrismaTransaction(fixture.transaction);
  const startedAt = performance.now();

  try {
    for (let index = 0; index < 250; index += 1) {
      await changeUserAccountStatus({
        actorUserId: "admin-1",
        actorUserName: "Administración",
        targetUserId: `usuario-${index}`,
        requestedIsActive: false,
      });
    }

    const elapsedMilliseconds = performance.now() - startedAt;
    assert.equal(fixture.auditEntries.length, 250);
    assert.ok(elapsedMilliseconds < 5000);
  } finally {
    restoreTransaction();
  }
});

test("aceptacion permite reactivar la misma identidad y preserva ambas auditorias", async () => {
  const fixture = createTransactionFixture([createUser("usuario-3")]);
  const restoreTransaction = replacePrismaTransaction(fixture.transaction);

  try {
    const deactivated = await changeUserAccountStatus({
      actorUserId: "admin-1",
      actorUserName: "Administración",
      targetUserId: "usuario-3",
      requestedIsActive: false,
    });
    const reactivated = await changeUserAccountStatus({
      actorUserId: "admin-1",
      actorUserName: "Administración",
      targetUserId: "usuario-3",
      requestedIsActive: true,
    });

    assert.equal(deactivated.user.id, reactivated.user.id);
    assert.equal(fixture.users.size, 1);
    assert.equal(fixture.users.get("usuario-3")?.isActive, true);
    assert.deepEqual(
      fixture.auditEntries.map(entry => entry.action),
      [getAccountStatusAuditAction(false), getAccountStatusAuditAction(true)],
    );
    assert.match(getAccountStatusMessage(reactivated.user, true), /reactivada correctamente/);
  } finally {
    restoreTransaction();
  }
});

test("integracion rechaza cambios de estado para cuentas administradoras", async () => {
  const fixture = createTransactionFixture([createUser("admin-2", "ADMIN")]);
  const restoreTransaction = replacePrismaTransaction(fixture.transaction);

  try {
    await assert.rejects(
      changeUserAccountStatus({
        actorUserId: "admin-1",
        actorUserName: "Administración",
        targetUserId: "admin-2",
        requestedIsActive: false,
      }),
      error => error instanceof AccountStatusError && error.httpStatus === 400,
    );
    assert.equal(fixture.users.get("admin-2")?.isActive, true);
    assert.equal(fixture.auditEntries.length, 0);
  } finally {
    restoreTransaction();
  }
});
