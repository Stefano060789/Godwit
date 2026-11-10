import { useEffect, useState } from "react";
import { BUSINESS_TYPES } from "../lib/personas";
import { saveWorkspaceBusinessType } from "../lib/workspaceProfile";

export default function BusinessProfile({ workspaceId, businessType, businessDescription = "", canManage, onSaved, t }) {
  const [selectedType, setSelectedType] = useState(businessType || "");
  const [customDescription, setCustomDescription] = useState(businessDescription);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setSelectedType(businessType || "");
    setCustomDescription(businessDescription || "");
  }, [businessType, businessDescription, workspaceId]);

  useEffect(() => setMessage(""), [workspaceId]);

  async function submit(event) {
    event.preventDefault();
    if (!workspaceId || !canManage || saving || !selectedType) return;
    if (selectedType === "other" && !customDescription.trim()) {
      setIsError(true);
      setMessage(t("admin.businessProfile.otherRequired", { defaultValue: "Describe your business or organization." }));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const profile = await saveWorkspaceBusinessType(workspaceId, selectedType, selectedType === "other" ? customDescription : "");
      onSaved(profile);
      setIsError(false);
      setMessage(t("admin.businessProfile.saved", { defaultValue: "Business type saved." }));
    } catch (error) {
      setIsError(true);
      setMessage(error.message || t("admin.businessProfile.error", { defaultValue: "Could not save your business type." }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="business-profile hub-page" aria-labelledby="business-profile-title">
      <header className="hub-page-heading">
        <p className="goal-eyebrow">{t("admin.hub.yourBusiness", { defaultValue: "Your Business" })}</p>
        <h2 id="business-profile-title">{t("admin.businessProfile.title", { defaultValue: "Tell Godwit about your business" })}</h2>
        <p>{t("admin.businessProfile.description", { defaultValue: "Choose the closest fit so Godwit can tailor customer guidance and goal-based Eggs to your business." })}</p>
      </header>
      {!workspaceId ? <p className="hub-notice">{t("admin.businessProfile.selectWorkspace", { defaultValue: "Select a workspace first." })}</p>
        : !canManage ? <p className="hub-notice">{t("admin.businessProfile.managerOnly", { defaultValue: "A workspace owner or editor can update this profile." })}</p>
          : <form onSubmit={submit}>
            <fieldset className="business-profile-options" disabled={saving}>
              <legend className="goal-multi-hint">{t("admin.businessProfile.choose", { defaultValue: "What kind of business or place is this?" })}</legend>
              <div className="business-profile-grid">
                {BUSINESS_TYPES.map((business) => <label key={business.key} className={selectedType === business.key ? "business-profile-choice is-selected" : "business-profile-choice"}>
                  <input
                    type="radio"
                    name="businessType"
                    value={business.key}
                    checked={selectedType === business.key}
                    onChange={() => {
                      setSelectedType(business.key);
                      setMessage("");
                    }}
                  />
                  <span>
                    <strong>{t(`admin.businessProfile.types.${business.key}.title`, { defaultValue: business.label })}</strong>
                    <span>{t(`admin.businessProfile.types.${business.key}.description`, { defaultValue: business.description })}</span>
                  </span>
                </label>)}
              </div>
              {selectedType === "other" && <label className="business-profile-custom">
                {t("admin.businessProfile.otherLabel", { defaultValue: "Describe your business or organisation" })}
                <textarea
                  required
                  maxLength={500}
                  rows={3}
                  value={customDescription}
                  onChange={(event) => {
                    setCustomDescription(event.target.value);
                    setMessage("");
                  }}
                  placeholder={t("admin.businessProfile.otherPlaceholder", { defaultValue: "For example: a fitness studio, clinic, or local nonprofit." })}
                />
              </label>}
            </fieldset>
            <button type="submit" className="goal-primary-action" disabled={saving || !selectedType || (selectedType === businessType && (selectedType !== "other" || customDescription === businessDescription))}>
              {saving
                ? t("admin.businessProfile.saving", { defaultValue: "Saving..." })
                : t("admin.businessProfile.save", { defaultValue: "Save business profile" })}
            </button>
            {message && <p className={isError ? "hub-error" : "hub-caption"} role={isError ? "alert" : "status"}>{message}</p>}
          </form>}
    </section>
  );
}
