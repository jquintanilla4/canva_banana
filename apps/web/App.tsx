import { Workspace } from '@canva-banana/workspace';
import { runtimeConfig } from './runtimeConfig';

export default function App() {
  return <Workspace config={runtimeConfig} desktopBridge={window.canvaBananaDesktop} standalone />;
}
