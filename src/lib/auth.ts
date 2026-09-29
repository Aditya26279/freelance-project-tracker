import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "cd_session";
const SESSION_DAYS = 30;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

let dummyHash: Promise<string> | null = null;

/**
 * When the user doesn't exist we still run a bcrypt compare against a dummy hash,
 * so response timing doesn't reveal which emails are registered.
 */
export async function verifyPassword(pw: string, hash: string | null) {
  if (!hash) {
    dummyHash ??= bcrypt.hash("timing-equalizer", 12);
    await bcrypt.compare(pw, await dummyHash);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(COOKIE);
}

/** Current user + their workspace, or null. Cached per request. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: {
      user: { include: { memberships: { include: { workspace: true }, take: 1 } } },
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const membership = session.user.memberships[0];
  if (!membership) return null;
  const { memberships: _m, passwordHash: _p, ...user } = session.user;
  return { user, workspace: membership.workspace, role: membership.role };
});

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
