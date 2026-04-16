import React, { useEffect, useMemo, useState } from 'react';

interface LoadingIndicatorProps {
  title: string;
  subtitle?: string;
  detail?: string;
  progress?: number;
  fullscreen?: boolean;
  size?: 'compact' | 'full';
}

const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  title,
  subtitle,
  detail,
  progress,
  fullscreen = false,
  size = 'compact',
}) => {
  const [animatedProgress, setAnimatedProgress] = useState(progress ?? 8);

  useEffect(() => {
    if (typeof progress === 'number') {
      setAnimatedProgress((prev) => {
        const target = clampProgress(progress);
        if (target >= prev) return target;
        return prev;
      });
      return undefined;
    }

    const interval = window.setInterval(() => {
      setAnimatedProgress((prev) => {
        const next = prev + Math.max(1, (96 - prev) * 0.08);
        return next >= 96 ? 96 : next;
      });
    }, 120);

    return () => window.clearInterval(interval);
  }, [progress]);

  const displayProgress = useMemo(
    () => clampProgress(typeof progress === 'number' ? animatedProgress : animatedProgress),
    [animatedProgress, progress],
  );

  const containerClass = fullscreen
    ? 'flex min-h-screen items-center justify-center bg-dark-bg px-6'
    : 'flex h-64 items-center justify-center px-6';

  const panelClass = size === 'full'
    ? 'w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm'
    : 'w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white px-6 py-7 shadow-[0_24px_64px_rgba(15,23,42,0.12)]';

  const titleClass = size === 'full'
    ? 'text-2xl font-black text-white'
    : 'text-xl font-black text-slate-900';

  const subtitleClass = size === 'full'
    ? 'text-sm leading-6 text-slate-300'
    : 'text-sm leading-6 text-slate-500';

  const trackClass = size === 'full'
    ? 'h-3 rounded-full bg-white/10'
    : 'h-3 rounded-full bg-slate-200';

  return (
    <div className={containerClass}>
      <div className={panelClass}>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className={titleClass}>{title}</p>
            {subtitle ? <p className={subtitleClass}>{subtitle}</p> : null}
            {detail ? (
              <p className={size === 'full' ? 'text-xs text-slate-400' : 'text-xs text-slate-400'}>
                {detail}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <div className={size === 'full' ? 'text-4xl font-black text-emerald-400' : 'text-3xl font-black text-emerald-600'}>
              {displayProgress}%
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className={trackClass}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-[width] duration-300 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <div className="grid grid-cols-3 gap-1">
            <span className="h-1.5 w-6 animate-pulse rounded-full bg-emerald-500/90" />
            <span className="h-1.5 w-6 animate-pulse rounded-full bg-teal-400/80 [animation-delay:140ms]" />
            <span className="h-1.5 w-6 animate-pulse rounded-full bg-cyan-400/80 [animation-delay:280ms]" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingIndicator;
