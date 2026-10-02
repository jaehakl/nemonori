import assert from "node:assert/strict";
import test from "node:test";
import {
  findTrackedEnvironmentFiles,
  isEmptyEnvironmentExample,
} from "../scripts/check-environment.mjs";

test("environment guard rejects nested and differently cased environment files", () => {
  assert.deepEqual(
    findTrackedEnvironmentFiles([".env.local", "nested/.ENV.production", "private.env", ".env.example", "README.md"]),
    [".env.local", "nested/.ENV.production", "private.env"],
  );
});

test("environment examples only allow comments and empty assignments", () => {
  assert.equal(isEmptyEnvironmentExample("# documentation\nNAME=\nOTHER=\"\"\nexport EMPTY='' # explanation\n"), true);
  assert.equal(isEmptyEnvironmentExample("TOKEN=synthetic-example-value"), false);
  assert.equal(isEmptyEnvironmentExample("TOKEN=$(synthetic-command)"), false);
  assert.equal(isEmptyEnvironmentExample("not an assignment"), false);
});
