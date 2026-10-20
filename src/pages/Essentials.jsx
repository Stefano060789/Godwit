import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { FLOCK } from "../lib/flock";
import FlockAvatar from "../components/FlockAvatar";

const ROBIN = FLOCK.find((bird) => bird.key === "robin");

const STEPS = [
  {
    number: "1",
    title: "Create one poll",
    detail: "Pick an industry template (restaurant, gym, salon...) or write your own one-line question with a few answer choices. That's it - no design work needed.",
    action: { to: "/create", label: "Create your first poll" }
  },
  {
    number: "2",
    title: "Create and share an Egg",
    detail: "Add your poll to an Egg, then share it with a QR code, an NFC tag, or both. Customers open the same experience, and you can update it later without replacing the code or tag.",
    action: { to: "/admin?tab=engagement", label: "Build your first Egg" }
  },
  {
    number: "3",
    title: "Check your results",
    detail: "Open your dashboard any time to see what people answered. If you want, turn on one simple thank-you message or discount code - everything else is optional.",
    action: { to: "/admin", label: "See your results" }
  }
];

export default function Essentials() {
  return (
    <Layout theme="workspace">
      <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-8">
        <div className="text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide text-teal-400">
            <FlockAvatar bird={ROBIN} size={22} /> Robin's quick start
          </p>
          <h1 className="mt-2 text-3xl font-bold">The 3 things that actually matter</h1>
          <p className="mt-3 text-slate-300">
            <strong className="text-white">Robin</strong> - Godwit's {ROBIN.role.toLowerCase()} - keeps this list short on
            purpose. Godwit has a lot of extra tools - rewards, prize draws, review links, benchmarks, an API. You
            don't need any of them to get value from your first poll. Do these three things, then come back here any
            time you feel lost.
          </p>
        </div>

        <div className="space-y-4">
          {STEPS.map((step) => (
            <article key={step.number} className="rounded-lg border border-slate-700 bg-slate-900 p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500 font-bold text-slate-950">{step.number}</span>
                <div>
                  <h2 className="text-lg font-bold">{step.title}</h2>
                  <p className="mt-1 text-sm text-slate-300">{step.detail}</p>
                  <Link to={step.action.to} className="mt-3 inline-block rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950">
                    {step.action.label}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="text-center text-sm text-slate-400">
          Everything else in your dashboard - rewards, prize draws, campaigns, benchmarks - is there when you're
          ready for it. It's fine to ignore all of it for now.
        </p>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 text-center">
          <p className="text-sm text-slate-300">
            <span className="mr-1 inline-flex align-middle"><FlockAvatar bird={ROBIN} size={20} /></span> Once you're in your dashboard, open the <strong className="text-white">First Guide</strong> tab -
            Robin is waiting there with a tailored checklist based on what you're using Godwit for (an artist, a
            cafe, a museum, a hotel...).
          </p>
          <Link to="/admin" className="mt-3 inline-block rounded border border-teal-500 px-4 py-2 text-sm font-semibold text-teal-300">
            Meet Robin in your dashboard
          </Link>
        </div>
      </div>
    </Layout>
  );
}
