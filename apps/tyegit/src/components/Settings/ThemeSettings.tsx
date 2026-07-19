import React, { useState } from 'react';
import { RiPaletteLine, RiMoonClearLine, RiSunLine, RiTerminalBoxLine, RiSave3Line } from 'react-icons/ri';

const themes = [
  { id: 'classic', name: 'Classic Poster (Light)', icon: <RiSunLine /> },
  { id: 'midnight', name: 'Midnight Retro (Dark)', icon: <RiMoonClearLine /> },
  { id: 'crt', name: 'Amber CRT (Terminal)', icon: <RiTerminalBoxLine /> },
];

export const ThemeSettings: React.FC = () => {
  const [activeTheme, setActiveTheme] = useState('classic');

  const handleApply = (themeId: string) => {
    setActiveTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 bg-[var(--tye-cream)] text-[var(--tye-ink)]">
      <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-[var(--tye-ink)]">
        <div>
          <h1 className="text-3xl font-bold font-pixel tracking-tight">Theme & Appearance</h1>
          <p className="text-sm opacity-80 mt-1 font-mono">Semantic Token System (F-059).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => handleApply(t.id)}
            className={`flex flex-col items-center justify-center gap-4 p-8 border-2 transition-all ${
              activeTheme === t.id 
                ? 'border-[var(--tye-ink)] bg-[var(--tye-lavender)] text-white shadow-[4px_4px_0px_0px_var(--tye-ink)]' 
                : 'border-[var(--tye-ink)]/20 bg-white hover:border-[var(--tye-ink)]'
            }`}
          >
            <div className="text-4xl">{t.icon}</div>
            <span className="font-bold font-mono text-sm">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="tye-card bg-white p-6">
        <h2 className="text-xl font-bold mb-4 font-mono"><RiPaletteLine className="inline mr-2" /> Custom Colors</h2>
        <p className="text-sm opacity-70 mb-4">Override specific semantic variables. Requires restart.</p>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-bold">
            Surface Color
            <input type="color" defaultValue="#FFFFFF" className="w-full h-10 cursor-pointer" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Accent Color
            <input type="color" defaultValue="#8B85C4" className="w-full h-10 cursor-pointer" />
          </label>
        </div>
        <button className="tye-btn tye-btn-primary mt-4 w-full">Save Custom Overrides</button>
      </div>
    </div>
  );
};
