import { useCallback, useEffect, useRef, useState } from 'react';
import type { JimengCanvasQuoteJob, RequestJimengCanvasApproval } from '../services/jimengCanvasGeneration';
import { getJimengCanvasCatalog, type JimengCanvasModel } from '../services/jimengCanvasService';
import { getJimengCanvasVideoModel, type ResolveJimengCanvasVideoModel } from '../services/jimengCanvasVideoModels';
import { SEEDREAM_55_JIMENG_CANVAS_PROVIDER_MODEL } from '../services/seedream55Config';

type CanvasApproval = {
  job: JimengCanvasQuoteJob;
  resolve: (decision: 'approve' | 'cancel') => void;
};

interface JimengCanvas {
  hasSeedream55: boolean;
  resolveVideoModel: ResolveJimengCanvasVideoModel;
  onReadyChange: (ready: boolean) => void;
  approval?: JimengCanvasQuoteJob;
  requestApproval: RequestJimengCanvasApproval;
  decideApproval: (decision: 'approve' | 'cancel') => void;
}

export const useJimengCanvas = (): JimengCanvas => {
  const [hasSeedream55, setHasSeedream55] = useState(false);
  const [videoCatalog, setVideoCatalog] = useState<JimengCanvasModel[]>();
  const [catalogAccess, setCatalogAccess] = useState({ ready: true });
  const [approval, setApproval] = useState<JimengCanvasQuoteJob | undefined>();
  const approvals = useRef<CanvasApproval[]>([]);

  useEffect(() => {
    if (!catalogAccess.ready) return;
    const controller = new AbortController();
    void getJimengCanvasCatalog({ kind: 'image', signal: controller.signal }).then(models => {
      if (controller.signal.aborted) return;
      setHasSeedream55(models.some(model => model.model === SEEDREAM_55_JIMENG_CANVAS_PROVIDER_MODEL
        && model.modes.some(mode => mode.name === 't2i')
        && model.modes.some(mode => mode.name === 'i2i')));
    }).catch(() => {
      if (!controller.signal.aborted) setHasSeedream55(false);
    });
    void getJimengCanvasCatalog({ kind: 'video', signal: controller.signal }).then(models => {
      if (!controller.signal.aborted) setVideoCatalog(models);
    }).catch(() => {
      if (!controller.signal.aborted) setVideoCatalog([]);
    });
    return () => controller.abort();
  }, [catalogAccess]);

  const onReadyChange = useCallback((ready: boolean) => {
    setHasSeedream55(false);
    setVideoCatalog(undefined);
    setCatalogAccess({ ready });
  }, []);

  const resolveVideoModel: ResolveJimengCanvasVideoModel = useCallback(version => (
    getJimengCanvasVideoModel(version, catalogAccess.ready ? videoCatalog : [])
  ), [catalogAccess.ready, videoCatalog]);

  const requestApproval: RequestJimengCanvasApproval = useCallback(job => new Promise(resolve => {
    approvals.current.push({ job, resolve });
    setApproval(approvals.current[0]?.job);
  }), []);

  const decideApproval = useCallback((decision: 'approve' | 'cancel') => {
    approvals.current.shift()?.resolve(decision);
    setApproval(approvals.current[0]?.job);
  }, []);

  useEffect(() => () => {
    for (const pending of approvals.current.splice(0)) pending.resolve('cancel');
  }, []);

  return {
    hasSeedream55: catalogAccess.ready && hasSeedream55,
    resolveVideoModel,
    onReadyChange,
    approval,
    requestApproval,
    decideApproval,
  };
};
