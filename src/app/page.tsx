"use client";

import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with React Flow
const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-screen h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm">Loading ChatFlow...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Canvas />;
}
