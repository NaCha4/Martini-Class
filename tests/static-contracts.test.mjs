import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function findHtmlFiles(directory = projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => entry.name !== ".git")
    .map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findHtmlFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
    }));

  return nested.flat();
}

test("admin access allows password accounts and denies anonymous sessions", async () => {
  const [client, firestoreRules, storageRules] = await Promise.all([
    read("assets/js/firebase-client.js"),
    read("firestore.rules"),
    read("storage.rules"),
  ]);
  const body = client.match(/export function isAllowedAdminUser\(user\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  const isAllowedAdminUser = new Function("user", body);
  for (const email of ["admin@martini.com", "officer@example.com"]) {
    assert.equal(isAllowedAdminUser({ email, isAnonymous: false, providerData: [{ providerId: "password" }] }), true);
  }
  for (const user of [null, {}, { isAnonymous: true },
    { email: "member@example.com", isAnonymous: true, providerData: [{ providerId: "password" }] },
    { email: "member@example.com", isAnonymous: false, providerData: [{ providerId: "google.com" }] }]) {
    assert.equal(isAllowedAdminUser(user), false);
  }
  for (const rules of [firestoreRules, storageRules]) {
    const adminBody = rules.match(/function isAdmin\(\) \{([\s\S]*?)\}/)?.[1];
    assert.match(adminBody, /return request\.auth != null\s*&& request\.auth\.token\.firebase\.sign_in_provider == "password";/);
  }
});

test("every static form declares a non-GET submission method", async () => {
  const htmlFiles = await findHtmlFiles();

  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const forms = html.match(/<form\b[^>]*>/g) || [];

    for (const form of forms) {
      assert.match(form, /\bmethod="post"/, `${path.relative(projectRoot, file)} has an unsafe form fallback`);
    }
  }
});
