const MIGRATION_ERROR_CODES = new Set(["PGRST202", "42883", "42703", "42P01"]);

export function getEggAccessAnalyticsErrorMessage(error, translate) {
  if (MIGRATION_ERROR_CODES.has(error?.code)) {
    return translate("admin.engagement.campaigns.migrationRequired");
  }
  if (error?.code === "P0001" && /authentication is required/i.test(error.message || "")) {
    return translate("admin.engagement.campaigns.sessionRequired");
  }
  return translate("admin.engagement.campaigns.loadFailed");
}
