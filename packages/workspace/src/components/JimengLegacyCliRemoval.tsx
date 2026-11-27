import React, { useState } from 'react';
import type { JimengLegacyCliInstallation, JimengLegacyCliLocation } from '../services/jimengCanvasService';

interface JimengLegacyCliRemovalProps {
  installations: JimengLegacyCliInstallation[];
  buttonClass: string;
  busy: boolean;
  onRemove: (location: JimengLegacyCliLocation) => void;
}

export const JimengLegacyCliRemoval: React.FC<JimengLegacyCliRemovalProps> = ({ installations, buttonClass, busy, onRemove }) => {
  const [confirming, setConfirming] = useState<JimengLegacyCliLocation | null>(null);

  return (
    <div className="mt-4 border-t border-white/10 pt-3 text-xs">
      <h3 className="font-semibold">Legacy Dreamina CLI</h3>
      <p className="mt-1 text-gray-400">Canvas uses a separate CLI. You can remove the older one without deleting login data.</p>
      <ul className="mt-2 space-y-3">
        {installations.map(({ location, path }) => (
          <li key={location}>
            <code className="block break-all text-gray-300">{path}</code>
            <button type="button" disabled={busy} aria-expanded={confirming === location} onClick={() => setConfirming(confirming === location ? null : location)} className={`mt-2 ${buttonClass}`}>Remove legacy CLI</button>
            {confirming === location && (
              <div role="group" aria-label="Confirm legacy CLI removal" className="mt-2 rounded-md border border-amber-300/25 bg-amber-300/5 p-2">
                <p>Remove this <code>dreamina</code> executable?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={buttonClass}>Cancel</button>
                  <button type="button" disabled={busy} onClick={() => {
                    setConfirming(null);
                    onRemove(location);
                  }} className={buttonClass}>Confirm removal</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
