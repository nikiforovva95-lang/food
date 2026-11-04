import { randomBytes, createHmac } from "node:crypto";
import path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
const [domain, testing] = process.argv.slice(2);
const valid = (s) =>
  typeof s === "string" &&
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s);
if (!valid(domain) || !valid(testing) || domain === testing)
  throw Error("Supply two distinct DNS hostnames without scheme/path.");
if (existsSync("deploy/.env"))
  throw Error(
    "Existing deployment keys were preserved. Do not regenerate keys for a running database.",
  );
function secrets() {
  const password = randomBytes(32).toString("hex"),
    jwt = randomBytes(48).toString("hex");
  const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const value =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({
      role: "anon",
      iss: "foodlab-selfhost",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400,
    });
  return {
    password,
    jwt,
    anon:
      value + "." + createHmac("sha256", jwt).update(value).digest("base64url"),
  };
}
const stable = secrets(),
  test = secrets();
const env = `FOODLAB_DOCKERFILE=${path.join(process.cwd(), "deploy/Dockerfile.release")}\nFOODLAB_DOMAIN=${domain}\nFOODLAB_TEST_DOMAIN=${testing}\nFOODLAB_STABLE_RELEASE=../.next/standalone\nFOODLAB_TESTING_RELEASE=../.next/standalone\nSTABLE_DB_PASSWORD=${stable.password}\nSTABLE_JWT_SECRET=${stable.jwt}\nSTABLE_ANON_KEY=${stable.anon}\nTESTING_DB_PASSWORD=${test.password}\nTESTING_JWT_SECRET=${test.jwt}\nTESTING_ANON_KEY=${test.anon}\nFOODLAB_AI_MODEL=gpt-4.1-mini\nFOODLAB_AI_KEY=\nFOODLAB_PRICE_FEED_URL=\nFOODLAB_PRICE_FEED_TOKEN=\n`;
writeFileSync("deploy/.env", env, { flag: "wx", mode: 0o600 });
console.log(
  "Deployment configuration generated with separate keys. Secret values were not printed. Select immutable artifact paths before deployment.",
);
