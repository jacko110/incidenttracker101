const production = process.env.NODE_ENV === "production";
const configuredSecret = process.env.JWT_SECRET?.trim();
if (production && (!configuredSecret || configuredSecret.length < 32 ||
    ["nib-dev-secret-change-me", "change-me-to-a-long-random-string"].includes(configuredSecret))) {
  throw new Error("Production requires JWT_SECRET with at least 32 characters; use a randomly generated secret.");
}
if (production && process.env.SEED_DEMO === "true") {
  throw new Error("Demo seeding is disabled in production.");
}
module.exports = {
  SECRET: configuredSecret || "nib-dev-secret-change-me",
  seedDemo: !production && process.env.SEED_DEMO === "true",
};
