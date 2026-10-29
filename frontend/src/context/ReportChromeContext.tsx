import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type HomeDto, type SyncState } from "../api";

type ReportChromeContextValue = {
  home: HomeDto | null;
  /** Plano resolvido na última Home. Vazio até a primeira leitura. */
  planKey: string;
  homeLoading: boolean;
  homeError: string | null;
  refreshHome: (quiet?: boolean) => void;
  patchCabecalho: (v: { title: string; subtitle: string }) => void;
  patchPeriodo: (v: HomeDto["periodo"]) => void;
  sync: SyncState | null;
  syncError: string | null;
  handleAtualizar: () => void;
  syncing: boolean;
  now: Date;
  /** Incrementa quando um sync termina com sucesso, para as outras abas buscarem de novo. */
  dataVersion: number;
};

const ReportChromeContext = createContext<ReportChromeContextValue | null>(null);

export function ReportChromeProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomeDto | null>(null);
  const [planKey, setPlanKey] = useState("");
  const planKeyRef = useRef("");
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const [dataVersion, setDataVersion] = useState(0);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshHome = useCallback((quiet = false) => {
    if (!quiet) {
      setHomeLoading(true);
      setHomeError(null);
    }
    api
      .home(planKeyRef.current || undefined)
      .then((d) => {
        const key = d.planKey?.trim() ?? "";
        planKeyRef.current = key;
        setPlanKey(key);
        setHome(d);
        setHomeError(null);
        setNow(new Date());
      })
      .catch((e: Error) => {
        setHomeError(e.message);
        setHome(null);
      })
      .finally(() => {
        if (!quiet) setHomeLoading(false);
      });
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      api
        .syncStatus()
        .then((s) => {
          setSync(s);
          if (s.status !== "running") {
            stopPolling();
            if (s.status === "success") {
              refreshHome(true);
              setDataVersion((v) => v + 1);
            }
          }
        })
        .catch((e: Error) => {
          stopPolling();
          setSyncError(e.message);
        });
    }, 1000);
  }, [refreshHome, stopPolling]);

  useEffect(() => {
    refreshHome();
  }, [refreshHome]);

  useEffect(() => {
    api
      .syncStatus()
      .then((s) => {
        if (s.status === "running") {
          setSync(s);
          startPolling();
        }
      })
      .catch(() => undefined);
    return stopPolling;
  }, [startPolling, stopPolling]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleAtualizar = useCallback(() => {
    setSyncError(null);
    api
      .startSync()
      .then(({ state }) => {
        setSync(state);
        if (state.status === "running") startPolling();
      })
      .catch((e: Error) => {
        setSync(null);
        setSyncError(e.message);
      });
  }, [startPolling]);

  const patchCabecalho = useCallback((v: { title: string; subtitle: string }) => {
    setHome((h) => (h ? { ...h, ...v } : h));
  }, []);

  const patchPeriodo = useCallback((periodo: HomeDto["periodo"]) => {
    setHome((h) => (h ? { ...h, periodo } : h));
  }, []);

  const syncing = sync?.status === "running";

  return (
    <ReportChromeContext.Provider
      value={{
        home,
        planKey,
        homeLoading,
        homeError,
        refreshHome,
        patchCabecalho,
        patchPeriodo,
        sync,
        syncError,
        handleAtualizar,
        syncing,
        now,
        dataVersion,
      }}
    >
      {children}
    </ReportChromeContext.Provider>
  );
}

export function useReportChrome(): ReportChromeContextValue {
  const ctx = useContext(ReportChromeContext);
  if (!ctx) throw new Error("useReportChrome deve ser usado dentro de ReportChromeProvider");
  return ctx;
}
