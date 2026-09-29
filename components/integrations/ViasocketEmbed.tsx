'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ViasocketEmbedProps {
  uniqueIdentifier: string;
}

interface ViasocketInstance {
  destroy?: () => void;
}

interface ViasocketRuntime {
  mount: (options: {
    embedToken: string;
    parent: HTMLElement;
    config?: Record<string, unknown>;
  }) => ViasocketInstance;
}

declare global {
  interface Window {
    viaSocket?: ViasocketRuntime;
  }
}

const EMBED_SCRIPT_URL =
  'https://embed.viasocket.com/prod-embedcomponent.js';

export function ViasocketEmbed({
  uniqueIdentifier,
}: ViasocketEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<ViasocketInstance | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const response = await fetch('/api/viasocket/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uniqueIdentifier,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data?.token) {
      throw new Error(
        data?.error || 'Failed to generate viaSocket token'
      );
    }

    return data.token;
  }, [uniqueIdentifier]);

  const loadScript = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.viaSocket) {
        resolve();
        return;
      }

      const existing = document.getElementById(
        'viasocket-embed-script'
      );

      if (existing) {
        existing.addEventListener(
          'load',
          () => resolve(),
          { once: true }
        );

        existing.addEventListener(
          'error',
          () =>
            reject(
              new Error(
                'Failed to load viaSocket Embed script'
              )
            ),
          { once: true }
        );

        return;
      }

      const script = document.createElement('script');

      script.id = 'viasocket-embed-script';
      script.src = EMBED_SCRIPT_URL;
      script.async = true;

      script.onload = () => resolve();

      script.onerror = () =>
        reject(
          new Error(
            'Failed to load viaSocket Embed script'
          )
        );

      document.head.appendChild(script);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setLoading(true);
        setError(null);

        const token = await getToken();

        if (cancelled) return;

        await loadScript();

        if (cancelled) return;

        if (!window.viaSocket) {
          throw new Error(
            'viaSocket runtime was not initialized'
          );
        }

        if (!containerRef.current) {
          throw new Error(
            'viaSocket container is not available'
          );
        }

        embedRef.current?.destroy?.();

        const embed = window.viaSocket.mount({
          embedToken: token,
          parent: containerRef.current,
          config: {
            pageheading: 'Automation',
            pagesubheading:
              'Connect your apps and build automated workflows.',
            showEnabled: true,
            hideWebhook: true,
            hideFunction: true,
          },
        });

        embedRef.current = embed;
      } catch (err) {
        console.error(
          'viaSocket Embed initialization failed:',
          err
        );

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load viaSocket Embed'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;

      embedRef.current?.destroy?.();
      embedRef.current = null;
    };
  }, [getToken, loadScript]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      <div
        ref={containerRef}
        className="h-full w-full"
      />
    </div>
  );
}