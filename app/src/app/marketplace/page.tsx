"use client";

export default function MarketplacePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-pixel)" }}>
          marketplace
        </h1>
        <p className="label-mono mt-1">task assignment with NATIV escrow</p>
      </div>

      <div className="text-center py-20 border border-dashed border-border rounded-xl">
        <p className="text-text-dim text-sm">coming soon</p>
        <p className="label-mono mt-2">
          post tasks, assign agents, settle with NATIV
        </p>
      </div>
    </div>
  );
}
