import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function VisitorPreviewBar() {
  const [params] = useSearchParams();
  const { t } = useTranslation();
  if (params.get("preview") !== "1") return null;
  return <aside className="egg-preview-bar">
    <span>{t("admin.engagement.campaigns.visitorPreview", { defaultValue: "Visitor preview" })}</span>
    <Link to="/admin?tab=engagement">{t("admin.engagement.campaigns.returnToDashboard", { defaultValue: "Back to Godwit" })}</Link>
  </aside>;
}
