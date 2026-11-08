import { useState } from "react";
import { loadEggMessagePage } from "../lib/eggMessages";

export default function EggMessageHistory({ campaignId, preview, total, t }) {
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const displayed = messages ?? preview;

  async function loadMore() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const page = await loadEggMessagePage(campaignId, messages?.at(-1));
      setMessages((current) => [...(current || []), ...page.messages]);
      setHasMore(page.hasMore);
    } catch (failure) {
      console.error("Unable to load Egg message history", failure);
      setError(t("admin.eggResults.historyError", { defaultValue: "Could not load more messages. Please try again." }));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ul>{displayed.map((message) => <li key={message.id}>
      <p>{message.message}</p>
      <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleDateString()}</time>
      {message.reply_email && <a href={`mailto:${encodeURIComponent(message.reply_email)}`}>{message.reply_email}</a>}
    </li>)}</ul>
    {error && <p role="alert" className="hub-error">{error}</p>}
    {(messages === null ? total > preview.length : hasMore) && <button type="button" className="goal-text-link" disabled={busy} onClick={loadMore}>
      {busy
        ? t("admin.eggResults.loading", { defaultValue: "Loading messages…" })
        : t("admin.eggResults.moreMessages", { defaultValue: "Read more messages" })}
    </button>}
  </>;
}
