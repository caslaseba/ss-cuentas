import { asRecord, errorMessage, supabaseHttps } from "@/lib/supabase/https";

export async function signupWithPassword(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  return supabaseHttps({
    pathname: "/auth/v1/signup",
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
      data: { full_name: input.fullName },
    },
  }).then(({ status, json }) => ({ status, json: asRecord(json) }));
}

export async function signinWithPassword(input: { email: string; password: string }) {
  return supabaseHttps({
    pathname: "/auth/v1/token?grant_type=password",
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
    },
  }).then(({ status, json }) => ({ status, json: asRecord(json) }));
}

export { errorMessage };
