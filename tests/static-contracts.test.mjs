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

test("the admin identity is consistent across client and security rules", async () => {
  const [client, firestoreRules, storageRules] = await Promise.all([
    read("assets/js/firebase-client.js"),
    read("firestore.rules"),
    read("storage.rules"),
  ]);
  const adminEmail = client.match(/const ADMIN_EMAIL = "([^"]+)";/)?.[1];

  assert.ok(adminEmail, "ADMIN_EMAIL must be configured in the client");
  assert.match(firestoreRules, new RegExp(`token\\.email == "${adminEmail}"`));
  assert.match(storageRules, new RegExp(`token\\.email == "${adminEmail}"`));
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
