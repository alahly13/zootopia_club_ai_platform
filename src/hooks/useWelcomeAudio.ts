import { useEffect, useRef } from 'react';
import {
  hasWelcomeAudioBeenHandledInThisSession,
  markWelcomeAudioStarted,
  shouldAttemptWelcomeAudio,
  WELCOME_AUDIO_START_DELAY_MS,
} from '../constants/welcomeFlow';
import { logger } from '../utils/logger';

type UseWelcomeAudioInput = {
  isOpen: boolean;
  contextKey: string | null;
};

export const useWelcomeAudio = ({ isOpen, contextKey }: UseWelcomeAudioInput) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (
      !isOpen ||
      !contextKey ||
      hasWelcomeAudioBeenHandledInThisSession(contextKey) ||
      !shouldAttemptWelcomeAudio(contextKey)
    ) {
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio('/welcomeaudio.mp3');
      audioRef.current.preload = 'metadata';
    }

    let cancelled = false;
    let listenersAttached = false;
    let playbackSettled = false;
    let interactionRetryConsumed = false;
    let audioStarted = false;
    let playbackTimerId: number | null = null;

    const detachRetryListeners = () => {
      if (!listenersAttached) {
        return;
      }

      window.removeEventListener('pointerdown', handleInteractionRetry);
      window.removeEventListener('keydown', handleInteractionRetry);
      listenersAttached = false;
    };

    const stopAudio = () => {
      if (!audioRef.current) {
        return;
      }

      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    };

    const playAudio = async () => {
      if (cancelled || !audioRef.current || playbackSettled) {
        return;
      }

      try {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        if (!cancelled) {
          if (!audioStarted) {
            markWelcomeAudioStarted(contextKey);
            audioStarted = true;
          }
          playbackSettled = true;
          detachRetryListeners();
        }
      } catch (error) {
        if (!cancelled && !playbackSettled) {
          attachRetryListeners();
          logger.debug('Welcome audio playback deferred until interaction', {
            area: 'welcome-audio',
            event: 'autoplay-deferred',
            error,
          });
        }
      }
    };

    const handleInteractionRetry = () => {
      detachRetryListeners();
      interactionRetryConsumed = true;
      void playAudio();
    };

    const attachRetryListeners = () => {
      if (listenersAttached || cancelled || playbackSettled || interactionRetryConsumed) {
        return;
      }

      /**
       * Browsers may block autoplay on the first post-login render. Keep the
       * welcome audio non-intrusive: retry only once on the user's first
       * interaction instead of spamming play attempts or console noise.
       */
      window.addEventListener('pointerdown', handleInteractionRetry, { once: true });
      window.addEventListener('keydown', handleInteractionRetry, { once: true });
      listenersAttached = true;
    };

    playbackTimerId = window.setTimeout(() => {
      void playAudio();
    }, WELCOME_AUDIO_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (playbackTimerId !== null) {
        window.clearTimeout(playbackTimerId);
      }
      detachRetryListeners();
      stopAudio();
    };
  }, [contextKey, isOpen]);

  return null;
};
