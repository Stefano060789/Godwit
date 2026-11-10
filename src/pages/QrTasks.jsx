import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { addWoodpeckerMessage, completeWoodpeckerTask, loadWoodpeckerPortal } from "../lib/woodpecker";
import { getEggTrialSessionId, isValidEggTrialSessionId } from "../lib/eggTrial";
import { normalizeEggAccessMethod } from "../lib/eggs";
import EggAiAssistant from "../components/EggAiAssistant";

export default function QrTasks() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [message, setMessage] = useState({});
  const [files, setFiles] = useState({});
  const [error, setError] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [trialSessionId] = useState(() => {
    const querySessionId = searchParams.get("trialSessionId");
    if (isValidEggTrialSessionId(querySessionId)) return querySessionId;
    return getEggTrialSessionId();
  });

  useEffect(() => {
    let cancelled = false;
    let channel;

    async function refresh() {
      try {
        const nextTasks = await loadWoodpeckerPortal(token);
        if (!cancelled) setTasks(nextTasks);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    }

    async function initialize() {
      const { data: campaign, error: campaignError } = await supabase
        .rpc("get_public_qr_campaign", { target_token: token })
        .maybeSingle();

      if (campaignError) {
        console.error("Unable to verify Egg task access:", campaignError);
        if (!cancelled) setError(t("trial.verifyFailed", { defaultValue: "We couldn't verify access to this Egg right now. Please try again later." }));
        return;
      }

      if (campaign) {
        const { data: allowed, error: accessError } = await supabase.rpc("record_egg_access", {
          target_campaign_id: campaign.campaign_id,
          target_access_method: normalizeEggAccessMethod(searchParams.get("via")),
          target_session_id: trialSessionId,
          target_is_preview: false
        });
        if (accessError) {
          console.error("Unable to verify Egg task access:", accessError);
          if (!cancelled) setError(t("trial.verifyFailed", { defaultValue: "We couldn't verify access to this Egg right now. Please try again later." }));
          return;
        }
        if (allowed !== true) {
          if (!cancelled) setError(t("trial.customerPaused", { defaultValue: "This Egg is temporarily unavailable. Please contact the business directly." }));
          return;
        }
      }

      if (cancelled) return;
      setAccessReady(true);
      await refresh();
      channel = supabase
        .channel(`woodpecker-${token}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "woodpecker_tasks" }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "woodpecker_task_history" }, refresh)
        .subscribe();
    }

    initialize();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [searchParams, t, token, trialSessionId]);

  async function send(task) {
    if (task.response_mode === "photo") {
      const file = files[task.id];
      if (!file) return;
      const path = `${token}/${task.id}-${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]+/gi, "-")}`;
      const { error: uploadError } = await supabase.storage.from("action-evidence").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { setError(uploadError.message); return; }
      const { data } = supabase.storage.from("action-evidence").getPublicUrl(path);
      await addWoodpeckerMessage(task.id, `Picture submitted: ${data.publicUrl}`);
      await completeWoodpeckerTask(task.id);
      setFiles({ ...files, [task.id]: null });
    } else {
      if (!message[task.id]?.trim()) return;
      await addWoodpeckerMessage(task.id, message[task.id]);
      if (task.response_mode === "text") await completeWoodpeckerTask(task.id);
      setMessage({ ...message, [task.id]: "" });
    }
    setTasks(await loadWoodpeckerPortal(token));
  }

  async function complete(taskId) {
    await completeWoodpeckerTask(taskId);
    setTasks(await loadWoodpeckerPortal(token));
  }

  return (
    <main className="qr-portal">
      <section className="qr-portal-card">
        <p className="qr-portal-brand">Godwit · Egg</p>
        <h1>Tasks for this Egg</h1>
        <p>Complete the requested task and share the required evidence with the team.</p>
        {error && <p role="alert">{error}</p>}
        {accessReady && tasks.length === 0 && <p>No tasks yet.</p>}
        {accessReady && tasks.map((task) => (
          <article id={`egg-task-${task.id}`} key={task.id} className="qr-portal-menu-item">
            <div className="flex justify-between gap-3">
              <h2 className="font-bold">{task.title}</h2>
              <span>{task.status}</span>
            </div>
            {task.description && <p>{task.description}</p>}
            <p className="mt-2 text-sm font-semibold text-teal-700">
              {task.response_mode === "photo" ? "Send a picture to complete this task." : task.response_mode === "text" ? "Send a text response to complete this task." : "Scan complete: this task is completed by scanning the QR code."}
            </p>
            <div className="mt-3 space-y-2">
              {(task.history || []).map((event) => (
                <p key={event.id} className="text-sm"><strong>{event.event_type === "completed" ? "✓ " : ""}</strong>{event.message || event.event_type}</p>
              ))}
            </div>
            {task.status !== "completed" && (
              <>
                {task.response_mode === "photo" ? (
                  <input type="file" accept="image/*" onChange={(event) => setFiles({ ...files, [task.id]: event.target.files?.[0] || null })} className="mt-3 w-full rounded border p-2" />
                ) : task.response_mode === "text" ? (
                  <textarea value={message[task.id] || ""} onChange={(event) => setMessage({ ...message, [task.id]: event.target.value })} placeholder="Add your response" className="mt-3 w-full rounded border p-2 text-black" rows="3" />
                ) : null}
                <div className="mt-2 flex gap-2">
                  {task.response_mode !== "scan" && <button type="button" onClick={() => send(task)} className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950">Submit and complete</button>}
                  {task.response_mode === "scan" && <button type="button" onClick={() => complete(task.id)} className="rounded border border-teal-400 px-3 py-2 text-sm">Mark complete</button>}
                </div>
              </>
            )}
          </article>
        ))}
        {accessReady && <EggAiAssistant token={token} trialSessionId={trialSessionId} />}
      </section>
    </main>
  );
}
