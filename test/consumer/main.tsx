import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace, type WorkspaceHandle, type WorkspaceCheckpoint, type WorkspaceState } from '@canva-banana/workspace';
import '@canva-banana/workspace/style.css';

function Consumer() {
  const editor = useRef<WorkspaceHandle>(null);
  const checkpoint = useRef<WorkspaceCheckpoint | null>(null);
  const saved = useRef<File | null>(null);
  const [mounted, setMounted] = useState(true);
  const [project, setProject] = useState('a');
  const [state, setState] = useState<WorkspaceState>({ mediaCount: 0, busy: false, error: null });
  const [status, setStatus] = useState('ready');
  const run = (operation: () => void | Promise<unknown>) => {
    void Promise.resolve().then(operation).catch(error => setStatus(`error: ${String(error)}`));
  };
  const load = () => editor.current!.loadMedia(new File([
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#f56535"/><circle cx="80" cy="45" r="25" fill="#102b45"/></svg>',
  ], 'shot.svg', { type: 'image/svg+xml' }), { prompt: 'Package consumer test shot' });

  return <main style={{ fontFamily: 'serif', margin: '24px' }}>
    <h1>Independent host</h1>
    <input aria-label="Host input" defaultValue="Host shortcuts and styling stay intact" />
    <div style={{ display: 'flex', gap: '8px', marginBlock: '16px', flexWrap: 'wrap' }}>
      <button onClick={() => run(load)}>Load sample</button>
      <button onClick={() => run(async () => { checkpoint.current = await editor.current!.createCheckpoint(); setStatus('checkpoint saved'); })}>Checkpoint</button>
      <button onClick={() => run(() => { editor.current!.restoreCheckpoint(checkpoint.current!); setStatus('checkpoint restored'); })}>Restore checkpoint</button>
      <button onClick={() => run(async () => { const blob = await editor.current!.exportImage(); setStatus(`exported ${blob.type} ${blob.size}`); })}>Export first image</button>
      <button onClick={() => run(async () => {
        const chunks: BlobPart[] = [];
        await editor.current!.writeSnapshot({ write: async data => {
          chunks.push(typeof data === 'string' ? data : data instanceof Uint8Array ? new Uint8Array(data).buffer : await data.arrayBuffer());
        } });
        saved.current = new File(chunks, 'consumer.bcsnap');
        setStatus(`snapshot saved ${saved.current.size}`);
      })}>Save snapshot</button>
      <button onClick={() => run(async () => { await editor.current!.importSnapshot(saved.current!); setStatus('snapshot imported'); })}>Import saved snapshot</button>
      <button onClick={() => setProject(value => value === 'a' ? 'b' : 'a')}>Switch project</button>
      <button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount editor' : 'Mount editor'}</button>
    </div>
    <output data-testid="status">{status}</output>
    <output data-testid="project">Project {project}</output>
    <pre data-testid="state">{JSON.stringify(state)}</pre>
    <section data-testid="editor-host" style={{ width: '100%', maxWidth: '1100px', height: '680px', border: '3px solid #dd6633', resize: 'both', overflow: 'hidden' }}>
      {mounted && <Workspace key={project} ref={editor} storageNamespace={`consumer-smoke:${project}`} onStateChange={setState} />}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Consumer />);
