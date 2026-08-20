import { useEffect, useRef } from 'react';

interface ModalIsolationOptions {
  backgroundSelectors: string[];
  onEscape?: () => void;
}

export function useModalIsolation(open: boolean, { backgroundSelectors, onEscape }: ModalIsolationOptions) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const selectorKey = backgroundSelectors.join(',');

  useEffect(() => {
    if (!open) return undefined;

    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isolated = selectorKey
      .split(',')
      .flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .filter((element, index, elements) => elements.indexOf(element) === index)
      .map(element => ({ element, alreadyInert: element.hasAttribute('inert') }));

    isolated.forEach(({ element }) => element.setAttribute('inert', ''));

    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
    const dialog = dialogs[dialogs.length - 1];
    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const openDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
        const activeDialog = openDialogs[openDialogs.length - 1];
        if (!activeDialog) return;

        const focusable = Array.from(activeDialog.querySelectorAll<HTMLElement>(
          focusableSelector,
        )).filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) {
          event.preventDefault();
          activeDialog.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      isolated.forEach(({ element, alreadyInert }) => {
        if (!alreadyInert) element.removeAttribute('inert');
      });
      if (restoreTarget?.isConnected) window.setTimeout(() => restoreTarget.focus(), 0);
    };
  }, [open, selectorKey]);
}
