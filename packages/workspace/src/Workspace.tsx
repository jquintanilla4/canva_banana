import { forwardRef, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import App from './App';
import { mountWorkspaceRuntime } from './services/runtimeConfig';
import { clearDebugLogs } from './services/debugLog';
import type { WorkspaceHandle, WorkspaceProps } from './workspaceTypes';

export const Workspace = forwardRef<WorkspaceHandle, WorkspaceProps>(function Workspace({
  className = '', children, onStateChange, ...options
}, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialOptions = useRef(options);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const portal = document.createElement('div');
    portal.className = 'canva-banana-portal';
    portal.style.setProperty('--canva-banana-ui-scale', initialOptions.current.standalone ? '1' : '0.8');
    const release = mountWorkspaceRuntime(initialOptions.current, rootRef.current!, portal);
    document.body.appendChild(portal);
    setReady(true);
    return () => {
      release();
      portal.remove();
      clearDebugLogs();
    };
  }, []); // Runtime/project changes use a new React key, avoiding mixed in-flight credentials or source handles.

  return (
    <div ref={rootRef} className={`canva-banana-workspace ${className}`} style={{ '--canva-banana-ui-scale': options.standalone ? 1 : 0.8 } as CSSProperties} tabIndex={-1}>
      {ready && <App editorRef={ref} standalone={options.standalone === true} onStateChange={onStateChange} />}
      {children}
    </div>
  );
});
