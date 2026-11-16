/**
 * Lance une exécution (route serveur bloquante jusqu'à la fin) et suit sa
 * progression réelle en interrogeant la base pendant ce temps (exécution
 * retrouvée par sa clé d'idempotence, étapes persistées par le serveur).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { apiPost, errorMessage, newRequestId } from "./api";
import { fetchSteps, RUN_SELECT, type RunRow, type StepRow } from "./workflowsClient";

export function useRunTracker() {
  const [run, setRun] = useState<RunRow | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{
    poll?: ReturnType<typeof setInterval>;
    tick?: ReturnType<typeof setInterval>;
  }>({});

  const stop = () => {
    if (timers.current.poll) clearInterval(timers.current.poll);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const start = useCallback(async (path: string, body: Record<string, unknown>) => {
    const key = newRequestId();
    setRunning(true);
    setError(null);
    setRun(null);
    setSteps([]);
    const t0 = Date.now();
    setElapsed(0);
    timers.current.tick = setInterval(() => setElapsed(Date.now() - t0), 200);
    let runId: string | null = null;
    timers.current.poll = setInterval(async () => {
      if (!runId) {
        const { data } = await supabase
          .from("workflow_runs")
          .select(RUN_SELECT)
          .eq("idempotency_key", key)
          .maybeSingle<RunRow>();
        if (data) {
          runId = data.id;
          setRun(data);
        }
      }
      if (runId) setSteps(await fetchSteps(runId));
    }, 1000);
    try {
      const res = await apiPost<{ run: RunRow }>(path, { ...body, idempotencyKey: key });
      setRun(res.run);
      setSteps(await fetchSteps(res.run.id));
      return res.run;
    } catch (e) {
      setError(errorMessage(e));
      if (runId) {
        const { data } = await supabase
          .from("workflow_runs")
          .select(RUN_SELECT)
          .eq("id", runId)
          .maybeSingle<RunRow>();
        if (data) setRun(data);
        setSteps(await fetchSteps(runId));
      }
      throw e;
    } finally {
      stop();
      setElapsed(Date.now() - t0);
      setRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setRun(null);
    setSteps([]);
    setError(null);
    setRunning(false);
  }, []);

  return { run, steps, running, elapsed, error, start, reset, setRun, setSteps };
}
