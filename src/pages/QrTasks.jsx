import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addWoodpeckerMessage, completeWoodpeckerTask, loadWoodpeckerPortal } from "../lib/woodpecker";
import EggAiAssistant from "../components/EggAiAssistant";

export default function QrTasks() {
  const { token } = useParams();
  const [tasks, setTasks] = useState([]);
  const [message, setMessage] = useState({});
  const [files, setFiles] = useState({});
  const [error, setError] = useState("");
  async function refresh() { try { setTasks(await loadWoodpeckerPortal(token)); } catch (e) { setError(e.message); } }
  useEffect(() => {
    refresh();
    const channel = supabase.channel(`woodpecker-${token}`).on("postgres_changes", { event: "*", schema: "public", table: "woodpecker_tasks" }, refresh).on("postgres_changes", { event: "INSERT", schema: "public", table: "woodpecker_task_history" }, refresh).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [token]);
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
    await refresh();
  }
  async function complete(taskId) { await completeWoodpeckerTask(taskId); await refresh(); }
  return <main className="qr-portal"><section className="qr-portal-card"><p className="qr-portal-brand">Godwit · Egg</p><h1>Tasks for this Egg</h1><p>Complete the requested Task and share the required evidence with the team.</p>{error && <p role="alert">{error}</p>}{tasks.length === 0 && <p>No Tasks yet.</p>}{tasks.map((task) => <article id={`egg-task-${task.id}`} key={task.id} className="qr-portal-menu-item"><div className="flex justify-between gap-3"><h2 className="font-bold">{task.title}</h2><span>{task.status}</span></div>{task.description && <p>{task.description}</p>}<p className="mt-2 text-sm font-semibold text-teal-700">{task.response_mode === "photo" ? "Send a picture to complete this Task." : task.response_mode === "text" ? "Send a text response to complete this Task." : "Scan complete: this Task is completed by scanning the QR code."}</p><div className="mt-3 space-y-2">{(task.history || []).map((event) => <p key={event.id} className="text-sm"><strong>{event.event_type === "completed" ? "✓ " : ""}</strong>{event.message || event.event_type}</p>)}</div>{task.status !== "completed" && <>{task.response_mode === "photo" ? <input type="file" accept="image/*" onChange={(e) => setFiles({ ...files, [task.id]: e.target.files?.[0] || null })} className="mt-3 w-full rounded border p-2" /> : task.response_mode === "text" ? <textarea value={message[task.id] || ""} onChange={(e) => setMessage({ ...message, [task.id]: e.target.value })} placeholder="Add your response" className="mt-3 w-full rounded border p-2 text-black" rows="3" /> : null}<div className="mt-2 flex gap-2">{task.response_mode !== "scan" && <button onClick={() => send(task)} className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950">Submit and complete</button>}{task.response_mode === "scan" && <button onClick={() => complete(task.id)} className="rounded border border-teal-400 px-3 py-2 text-sm">Mark complete</button>}</div></>}</article>)}<EggAiAssistant token={token} /></section></main>;
}
