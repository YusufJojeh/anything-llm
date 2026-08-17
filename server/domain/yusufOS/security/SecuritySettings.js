const prisma = require("../../../utils/prisma");
const { SECURITY_SETTING_KEYS } = require("../constants");
const { assertHumanPrincipal } = require("../identity/principals");
const { AuditService } = require("../audit/AuditService");

class SecuritySettings {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
  }

  async externalMutationsDisabled(db = this.db) {
    const setting = await db.yusuf_security_settings.findUnique({
      where: { key: SECURITY_SETTING_KEYS.EXTERNAL_MUTATIONS_DISABLED },
    });
    return setting?.value === "true";
  }

  async setExternalMutationsDisabled(disabled, { principal, requestId }) {
    const user = assertHumanPrincipal(principal);
    return this.db.$transaction(async (tx) => {
      const setting = await tx.yusuf_security_settings.upsert({
        where: { key: SECURITY_SETTING_KEYS.EXTERNAL_MUTATIONS_DISABLED },
        create: {
          key: SECURITY_SETTING_KEYS.EXTERNAL_MUTATIONS_DISABLED,
          value: disabled ? "true" : "false",
          updatedBy: `${user.type}:${user.id}`,
        },
        update: {
          value: disabled ? "true" : "false",
          updatedBy: `${user.type}:${user.id}`,
          version: { increment: 1 },
        },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "security.external_mutations_changed",
        principal: user,
        outcome: disabled ? "DISABLED" : "ENABLED",
        metadata: { disabled, version: setting.version },
        requestId,
      });
      return setting;
    });
  }
}

module.exports = { SecuritySettings };
