import * as React from 'react';

export const EGYPT_TIME_ZONE = 'Africa/Cairo';
export const AUTH_DAY_START_HOUR_EGYPT = 6;
export const AUTH_NIGHT_START_HOUR_EGYPT = 18;

export type EgyptAuthBackgroundPhase = 'day' | 'night';

export interface EgyptAuthBackgroundState {
  phase: EgyptAuthBackgroundPhase;
  imagePath: string;
  cairoHour: number;
  cairoMinute: number;
  cairoLabel: string;
}

const AUTH_BACKGROUND_ASSETS: Record<EgyptAuthBackgroundPhase, string> = Object.freeze({
  // Intentionally mapped to the requested assets even though their filenames
  // look visually inverted. Preserve this contract unless product direction changes.
  day: '/science-faculty-enhanced-dark-4.png',
  night: '/science-faculty-enhanced-light-5.png',
});

const cairoTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: EGYPT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const getEgyptHourAndMinute = (date = new Date()) => {
  const parts = cairoTimeFormatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return {
    hour,
    minute,
  };
};

export const resolveEgyptAuthBackground = (date = new Date()): EgyptAuthBackgroundState => {
  const { hour, minute } = getEgyptHourAndMinute(date);
  const phase: EgyptAuthBackgroundPhase =
    hour >= AUTH_DAY_START_HOUR_EGYPT && hour < AUTH_NIGHT_START_HOUR_EGYPT ? 'day' : 'night';

  return {
    phase,
    imagePath: AUTH_BACKGROUND_ASSETS[phase],
    cairoHour: hour,
    cairoMinute: minute,
    cairoLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${EGYPT_TIME_ZONE}`,
  };
};

const getDelayUntilNextMinuteTick = () => {
  const now = Date.now();
  const millisecondsUntilNextMinute = 60_000 - (now % 60_000);
  return Math.max(1_000, millisecondsUntilNextMinute + 150);
};

export const useEgyptAuthBackground = () => {
  const [backgroundState, setBackgroundState] = React.useState<EgyptAuthBackgroundState>(() =>
    resolveEgyptAuthBackground()
  );

  React.useEffect(() => {
    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      timeoutId = window.setTimeout(() => {
        setBackgroundState((current) => {
          const next = resolveEgyptAuthBackground();

          if (
            current.phase === next.phase &&
            current.imagePath === next.imagePath
          ) {
            return current;
          }

          return next;
        });

        scheduleRefresh();
      }, getDelayUntilNextMinuteTick());
    };

    scheduleRefresh();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return backgroundState;
};
