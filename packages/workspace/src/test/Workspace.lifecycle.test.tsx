import { StrictMode, useCallback, type Ref } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../Workspace';
import type { WorkspaceHandle } from '../workspaceTypes';

vi.mock('../App', async () => {
  const { useImperativeHandle } = await import('react');
  return { default: function MockApp({ editorRef }: { editorRef?: Ref<{ setPrompt: (value: string) => void }> }) {
    useImperativeHandle(editorRef, () => ({ setPrompt: () => {} }), []);
    return <div>Editor ready</div>;
  } };
});
afterEach(cleanup);

describe('embedded workspace mounting', () => {
  it('notifies a stable callback ref when the deferred editor is ready, including StrictMode', () => {
    const observeHandle = vi.fn();
    function Host() {
      const attach = useCallback((handle: WorkspaceHandle | null) => {
        if (handle) { handle.setPrompt('Initial shot'); observeHandle(handle); }
      }, []);
      return <Workspace ref={attach} />;
    }
    const host = render(<StrictMode><Host /></StrictMode>);
    expect(observeHandle).toHaveBeenCalledWith(expect.objectContaining({ setPrompt: expect.any(Function) }));
    host.unmount();
    render(<Workspace />); // Closing the prior host releases ownership for another mount.
  });
});
