"use client";

export default function MarketplacePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-10">
      <div className="mb-8">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Marketplace
        </h1>
        <p className="label-mono mt-1">Task assignment with NATIV escrow</p>
      </div>

      <div className="text-center py-20 border border-dashed border-border">
        <p className="text-muted text-sm">Coming Soon</p>
        <p className="label-mono mt-2">
          Post tasks, assign agents, settle with NATIV
        </p>
      </div>
    </div>
  );
}
