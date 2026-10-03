'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';
import {
  BrandingSettings,
  applyBrandingCssVariables,
  DEFAULT_BRAND_PRIMARY,
  DEFAULT_BRAND_SECONDARY,
} from '@/lib/branding';

interface BrandingContextValue {
  branding: BrandingSettings;
  isLoading: boolean;
  refreshBranding: () => Promise<void>;
  updateLiveBranding: (preview: Partial<BrandingSettings>) => void;
}

const defaultBranding: BrandingSettings = {
  primaryColor: DEFAULT_BRAND_PRIMARY,
  secondaryColor: DEFAULT_BRAND_SECONDARY,
  logoUrl: null,
  defaultSenderName: null,
  companyAddress: null,
  emailFooterText: null,
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: defaultBranding,
  isLoading: false,
  refreshBranding: async () => {},
  updateLiveBranding: () => {},
});

export const BRANDING_UPDATED_EVENT = 'graphsign:branding-updated';

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    if (typeof window === 'undefined') return defaultBranding;
    try {
      const cached = localStorage.getItem('graphsign_branding');
      return cached ? { ...defaultBranding, ...JSON.parse(cached) } : defaultBranding;
    } catch {
      return defaultBranding;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const applyAndSave = useCallback((newSettings: BrandingSettings) => {
    setBranding(newSettings);
    applyBrandingCssVariables(newSettings);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('graphsign_branding', JSON.stringify(newSettings));
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  const refreshBranding = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
    if (!token) return;

    try {
      setIsLoading(true);
      const res = await fetch(`${getApiUrl()}/api/v1/organisations/me/branding`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const updated: BrandingSettings = {
          logoUrl: data.logoUrl || null,
          primaryColor: data.primaryColor || DEFAULT_BRAND_PRIMARY,
          secondaryColor: data.secondaryColor || DEFAULT_BRAND_SECONDARY,
          defaultSenderName: data.defaultSenderName || null,
          companyAddress: data.companyAddress || null,
          emailFooterText: data.emailFooterText || null,
        };
        applyAndSave(updated);
      }
    } catch (err) {
      console.debug('Failed to fetch organisation branding:', err);
    } finally {
      setIsLoading(false);
    }
  }, [applyAndSave]);

  const updateLiveBranding = useCallback((preview: Partial<BrandingSettings>) => {
    setBranding((prev) => {
      const merged = { ...prev, ...preview };
      applyBrandingCssVariables(merged);
      return merged;
    });
  }, []);

  useEffect(() => {
    applyBrandingCssVariables(branding);
  }, [branding]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialBranding() {
      if (typeof window === 'undefined') return;
      const token =
        localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
      if (!token) return;

      try {
        const res = await fetch(`${getApiUrl()}/api/v1/organisations/me/branding`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
          },
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          const updated: BrandingSettings = {
            logoUrl: data.logoUrl || null,
            primaryColor: data.primaryColor || DEFAULT_BRAND_PRIMARY,
            secondaryColor: data.secondaryColor || DEFAULT_BRAND_SECONDARY,
            defaultSenderName: data.defaultSenderName || null,
            companyAddress: data.companyAddress || null,
            emailFooterText: data.emailFooterText || null,
          };
          applyAndSave(updated);
        }
      } catch (err) {
        console.debug('Failed to fetch organisation branding:', err);
      }
    }

    void loadInitialBranding();

    function handleBrandingEvent(e: Event) {
      const customEvent = e as CustomEvent<BrandingSettings>;
      if (customEvent.detail) {
        applyAndSave(customEvent.detail);
      } else {
        void loadInitialBranding();
      }
    }

    window.addEventListener(BRANDING_UPDATED_EVENT, handleBrandingEvent);
    return () => {
      isMounted = false;
      window.removeEventListener(BRANDING_UPDATED_EVENT, handleBrandingEvent);
    };
  }, [applyAndSave]);

  return (
    <BrandingContext.Provider
      value={{
        branding,
        isLoading,
        refreshBranding,
        updateLiveBranding,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
