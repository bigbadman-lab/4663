import { PresenceStatus } from "@/components/presence-status";

export default function Home() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
        4663
      </h1>
      <p className="text-sm text-neutral-500">
        live intelligence for robinhood chain
      </p>
      <PresenceStatus />
    </main>
  );
}
