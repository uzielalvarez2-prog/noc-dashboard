"use client";

import { useEffect, useState } from "react";

interface LiveIndicatorProps {
  lastSync?: string;
}

export function LiveIndicator({ lastSync }: LiveIndicatorProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [lastSync]);

  useEffect(() => {
    setSeconds(0);
  }, [lastSync]);

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span className="font-mono text-xs text-text-muted">
        Actualizado hace {seconds}s
      </span>
    </div>
  );
}
