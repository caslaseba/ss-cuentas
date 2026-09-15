import { asRecord, errorMessage, supabaseHttps } from "@/lib/supabase/https";
import type { ManagedUser, UserRole } from "@/lib/types";

type AuthUser = {
  id?: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: { full_name?: string };
};

type ProfileRow = {
  id?: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
};

function asRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const { json: authJson, status: authStatus } = await supabaseHttps({
    pathname: "/auth/v1/admin/users?page=1&per_page=200",
    method: "GET",
    key: "service",
  });
  let { json: profileJson } = await supabaseHttps({
    pathname: "/rest/v1/profiles?select=id,email,full_name,role,created_at",
    method: "GET",
    key: "service",
  });
  if (!Array.isArray(profileJson)) {
    const fallback = await supabaseHttps({
      pathname: "/rest/v1/profiles?select=id,email,full_name,created_at",
      method: "GET",
      key: "service",
    });
    profileJson = fallback.json;
  }

  if (authStatus >= 400) {
    throw new Error(errorMessage(authJson, "No se pudieron listar los usuarios."));
  }

  const authUsers = (asRecord(authJson).users as AuthUser[] | undefined) ?? [];
  const profiles = Array.isArray(profileJson) ? (profileJson as ProfileRow[]) : [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return authUsers
    .filter((u) => typeof u.id === "string")
    .map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id as string,
        email: u.email ?? profile?.email ?? "",
        full_name: profile?.full_name ?? u.user_metadata?.full_name ?? null,
        role: asRole(profile?.role),
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email, "es"));
}

export async function createManagedUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}) {
  const { status, json } = await supabaseHttps({
    pathname: "/auth/v1/admin/users",
    method: "POST",
    key: "service",
    body: {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    },
  });

  if (status >= 400) {
    throw new Error(errorMessage(json, "No se pudo crear el usuario."));
  }

  const created = asRecord(json);
  const id = typeof created.id === "string" ? created.id : null;
  if (id && input.role === "admin") {
    await updateProfileRole(id, "admin");
  }

  return { id };
}

export async function updateManagedUser(
  id: string,
  patch: { password?: string; fullName?: string; role?: UserRole },
) {
  if (patch.password || patch.fullName) {
    const body: Record<string, unknown> = {};
    if (patch.password) body.password = patch.password;
    if (patch.fullName) body.user_metadata = { full_name: patch.fullName };
    const { status, json } = await supabaseHttps({
      pathname: `/auth/v1/admin/users/${id}`,
      method: "PUT",
      key: "service",
      body,
    });
    if (status >= 400) {
      throw new Error(errorMessage(json, "No se pudo actualizar el usuario."));
    }
  }

  if (patch.fullName || patch.role) {
    const profile: Record<string, unknown> = {};
    if (patch.fullName) profile.full_name = patch.fullName;
    if (patch.role) profile.role = patch.role;
    await patchProfile(id, profile);
  }
}

export async function deleteManagedUser(id: string) {
  const { status, json } = await supabaseHttps({
    pathname: `/auth/v1/admin/users/${id}`,
    method: "DELETE",
    key: "service",
  });
  if (status >= 400) {
    throw new Error(errorMessage(json, "No se pudo eliminar el usuario."));
  }
}

async function updateProfileRole(id: string, role: UserRole) {
  await patchProfile(id, { role });
}

async function patchProfile(id: string, body: Record<string, unknown>) {
  const { status, json } = await supabaseHttps({
    pathname: `/rest/v1/profiles?id=eq.${id}`,
    method: "PATCH",
    key: "service",
    body,
    extraHeaders: { Prefer: "return=minimal" },
  });
  if (status >= 400) {
    throw new Error(errorMessage(json, "No se pudo actualizar el perfil."));
  }
}
