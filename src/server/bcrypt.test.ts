// Roda com: bun test
import { expect, test } from "bun:test";
import bcrypt from "bcryptjs";

// Formato de auth.users.encrypted_password no Supabase: bcrypt $2a$, custo 10.
const HASH_SUPABASE = "$2a$10$69ZGLyCWJgNn5b4KvRZPpOb/YFjnBTW0pFh9BqcUw9qh4qxJQ/DYa";

test("bcryptjs confere o hash $2a$ copiado do Supabase", async () => {
  expect(await bcrypt.compare("senha-do-supabase", HASH_SUPABASE)).toBe(true);
  expect(await bcrypt.compare("outra-senha", HASH_SUPABASE)).toBe(false);
});
