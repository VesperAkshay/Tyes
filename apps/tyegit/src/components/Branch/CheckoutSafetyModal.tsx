import React from 'react';
import { RiAlertFill, RiArchiveDrawerLine, RiDeleteBin2Line, RiCloseLine } from 'react-icons/ri';
import { CheckoutStrategy } from '../../types';

interface CheckoutSafetyModalProps {
  branchName: string;
  affectedFiles: string[];
  suggestion: string;
  onProceed: (strategy: CheckoutStrategy) => void;
  onClose: () => void;
}

export const CheckoutSafetyModal: React.FC<CheckoutSafetyModalProps> = ({
  branchName,
  affectedFiles,
  suggestion,
  onProceed,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="tye-card bg-[var(--tye-cream)] text-[var(--tye-ink)] max-w-lg w-full p-6 border-4 border-[var(--tye-ink)] shadow-[8px_8px_0px_0px_var(--tye-ink)] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between pb-4 border-b-2 border-[var(--tye-ink)] mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--tye-mustard)]/20 border-2 border-[var(--tye-ink)] flex items-center justify-center text-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
              <RiAlertFill className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="font-pixel text-xl font-bold tracking-tight">Uncommitted Changes (`F-027`)</h2>
              <p className="text-xs font-mono opacity-80 mt-0.5">
                Switching to <span className="font-bold text-[var(--tye-lavender)]">{branchName}</span> requires clean working tree.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--tye-ink)] hover:text-[var(--tye-cream)] transition-colors border-2 border-transparent hover:border-[var(--tye-ink)]"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-5">
          <p className="text-sm font-mono mb-3 bg-white p-3 border-2 border-[var(--tye-ink)] shadow-[2px_2px_0px_0px_var(--tye-ink)]">
            {suggestion}
          </p>

          <h4 className="font-bold text-xs uppercase font-mono tracking-wider opacity-70 mb-2">
            Affected Files ({affectedFiles.length})
          </h4>
          <div className="max-h-36 overflow-y-auto bg-white border-2 border-[var(--tye-ink)] p-2 font-mono text-xs space-y-1">
            {affectedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 truncate text-[var(--tye-ink)]">
                <span className="w-2 h-2 bg-[var(--tye-mustard)] rounded-full flex-shrink-0" />
                <span className="truncate">{file}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t-2 border-[var(--tye-ink)]">
          <button
            onClick={() => onProceed('stash_and_checkout')}
            className="flex-1 tye-btn tye-btn-primary flex items-center justify-center gap-2 text-xs py-2.5"
          >
            <RiArchiveDrawerLine className="w-4 h-4" />
            <span>Stash & Checkout</span>
          </button>
          <button
            onClick={() => onProceed('discard_and_checkout')}
            className="flex-1 bg-rose-600 text-white font-mono font-bold px-4 py-2.5 border-2 border-[var(--tye-ink)] shadow-[3px_3px_0px_0px_var(--tye-ink)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_var(--tye-ink)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--tye-ink)] transition-all flex items-center justify-center gap-2 text-xs"
          >
            <RiDeleteBin2Line className="w-4 h-4" />
            <span>Discard & Checkout</span>
          </button>
        </div>
        <div className="mt-2 text-center">
          <button
            onClick={onClose}
            className="text-xs font-mono underline opacity-70 hover:opacity-100"
          >
            Cancel and stay on current branch
          </button>
        </div>
      </div>
    </div>
  );
};
