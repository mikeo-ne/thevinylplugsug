import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { DraftConfiguration, DraftFiles, DraftPayment, ClientDetails } from '../types';
import { DEFAULT_CONFIGURATION, defaultPlantId, plantSupportsQuantity, plants, quoteFor } from '../lib/pricing';
import { useConfig } from '../hooks/useConfig';

const STORAGE_KEY = '7h-draft-v1';

const emptyFiles: DraftFiles = { audio: [], artwork: [], audioLink: '', artworkLink: '' };

const emptyClient: ClientDetails = {
  name: '',
  email: '',
  phone: '',
  deliveryType: 'uganda',
  deliveryAddress: '',
  deliveryCity: '',
  country: 'Uganda',
  notes: '',
};

const emptyPayment: DraftPayment = { method: 'mtn_momo', payerPhone: '', payerName: '' };

/** Cheapest plant on the panel that will quote this run size. */
function pickPlantFor(quantity: number): string {
  const eligible = plants
    .filter((plant) => plantSupportsQuantity(plant, quantity))
    .sort((a, b) => a.priceFactor - b.priceFactor);
  return eligible[0]?.id ?? defaultPlantId;
}

interface DraftState {
  configuration: DraftConfiguration;
  client: ClientDetails;
  files: DraftFiles;
  payment: DraftPayment;
  termsAccepted: boolean;
  plantPreference: string;
}

const initialState: DraftState = {
  configuration: DEFAULT_CONFIGURATION,
  client: emptyClient,
  files: emptyFiles,
  payment: emptyPayment,
  termsAccepted: false,
  plantPreference: defaultPlantId,
};

interface DraftContextValue extends DraftState {
  setConfiguration: (patch: Partial<DraftConfiguration>) => void;
  setClient: (patch: Partial<ClientDetails>) => void;
  setFiles: (patch: Partial<DraftFiles>) => void;
  setPayment: (patch: Partial<DraftPayment>) => void;
  setTerms: (value: boolean) => void;
  setPlantPreference: (value: string) => void;
  reset: () => void;
  quote: ReturnType<typeof quoteFor>;
  fxRate: number;
}

const DraftContext = createContext<DraftContextValue | null>(null);

function readDraft(): DraftState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    return {
      configuration: { ...initialState.configuration, ...parsed.configuration },
      client: { ...emptyClient, ...parsed.client },
      files: { ...emptyFiles, ...parsed.files, audioLink: parsed.files?.audioLink ?? '', artworkLink: parsed.files?.artworkLink ?? '' },
      payment: { ...emptyPayment, ...parsed.payment },
      termsAccepted: Boolean(parsed.termsAccepted),
      plantPreference: parsed.plantPreference ?? defaultPlantId,
    };
  } catch {
    return initialState;
  }
}

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const { config } = useConfig();
  const [state, setState] = useState<DraftState>(readDraft);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* ignore quota errors */
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [state]);

  const setConfiguration = useCallback(
    (patch: Partial<DraftConfiguration>) =>
      setState((prev) => {
        const configuration = { ...prev.configuration, ...patch };
        // A plant that cannot take the new run size would produce an invalid
        // quote, so move to the cheapest plant that will (e.g. 250 → 1 unit
        // hands the job to the lathe house).
        const plantPreference = plantSupportsQuantity(
          plants.find((plant) => plant.id === prev.plantPreference),
          configuration.quantity,
        )
          ? prev.plantPreference
          : pickPlantFor(configuration.quantity);
        return { ...prev, configuration, plantPreference };
      }),
    [],
  );

  const setClient = useCallback(
    (patch: Partial<ClientDetails>) =>
      setState((prev) => ({ ...prev, client: { ...prev.client, ...patch } })),
    [],
  );

  const setFiles = useCallback(
    (patch: Partial<DraftFiles>) => setState((prev) => ({ ...prev, files: { ...prev.files, ...patch } })),
    [],
  );

  const setPayment = useCallback(
    (patch: Partial<DraftPayment>) =>
      setState((prev) => ({ ...prev, payment: { ...prev.payment, ...patch } })),
    [],
  );

  const setTerms = useCallback((value: boolean) => setState((prev) => ({ ...prev, termsAccepted: value })), []);
  const setPlantPreference = useCallback(
    (value: string) =>
      setState((prev) => ({
        ...prev,
        plantPreference: value,
        configuration: { ...prev.configuration, plantId: value },
      })),
    [],
  );

  const reset = useCallback(() => {
    setState(initialState);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const fxRate = config?.fxRate ?? 3750;
  const quote = useMemo(
    () => quoteFor(state.configuration, fxRate, state.plantPreference),
    [state.configuration, fxRate, state.plantPreference],
  );

  const value = useMemo<DraftContextValue>(
    () => ({
      ...state,
      setConfiguration,
      setClient,
      setFiles,
      setPayment,
      setTerms,
      setPlantPreference,
      reset,
      quote,
      fxRate,
    }),
    [state, setConfiguration, setClient, setFiles, setPayment, setTerms, setPlantPreference, reset, quote, fxRate],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft() {
  const context = useContext(DraftContext);
  if (!context) throw new Error('useDraft must be used inside <DraftProvider>');
  return context;
}
