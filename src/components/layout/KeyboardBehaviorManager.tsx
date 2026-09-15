"use client";

import { useEffect } from 'react';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

/**
 * Global Keyboard Behavior Manager
 * Handles:
 * 1. Automatically scrolling focused input fields smoothly to the center of the viewport ONLY if they are covered by the virtual keyboard.
 * 2. Toggling the `.keyboard-active` class on the HTML root dynamically when the virtual keyboard is active.
 * 3. Disabling autocorrect, spellcheck, and autocomplete globally on text inputs based on the admin config setting.
 */
export default function KeyboardBehaviorManager() {
  const { config: appConfig } = useApplicationConfig();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.contentEditable === 'true';

      if (isInput) {
        // 1. Disable suggestions and predictive autocorrect if disabled in admin config
        const suggestionsEnabled = appConfig?.enableKeyboardSuggestions !== false;

        if (!suggestionsEnabled && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          const type = target.getAttribute('type');
          if (!type || ['text', 'search', 'tel', 'email', 'url', 'number', 'password'].includes(type)) {
            if (!target.hasAttribute('autocomplete')) {
              target.setAttribute('autocomplete', 'off');
            }
            if (!target.hasAttribute('autocorrect')) {
              target.setAttribute('autocorrect', 'off');
            }
            if (!target.hasAttribute('spellcheck')) {
              target.setAttribute('spellcheck', 'false');
            }
          }
        }

        // 2. Set keyboard-active state immediately on focus
        document.documentElement.classList.add('keyboard-active');

        // 3. Smoothly scroll the focused element ONLY if it is covered by the keyboard (and not excluded)
        const shouldScroll = !target.classList.contains('no-keyboard-scroll') && !target.closest('.no-keyboard-scroll');
        if (shouldScroll) {
          setTimeout(() => {
            const rect = target.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            
            // Mobile keyboard typically takes up ~280px at the bottom of the screen.
            // Any focused element below (window.innerHeight - 280px) will be covered by it.
            const safeBottom = viewportHeight - 280;

            // Scroll only if element is covered by the keyboard (bottom > safeBottom) or scrolled off top (top < 60)
            if (rect.bottom > safeBottom || rect.top < 60) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      }
    };

    const handleFocusOut = () => {
      // Small delay to verify if focus moved to another input
      setTimeout(() => {
        const active = document.activeElement;
        const isStillInput = active && (
          active.tagName === 'INPUT' || 
          active.tagName === 'TEXTAREA' || 
          (active as HTMLElement).contentEditable === 'true'
        );

        if (!isStillInput) {
          document.documentElement.classList.remove('keyboard-active');
        }
      }, 100);
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // 4. Monitor virtual viewport resizing to detect virtual keyboard opening/closing
    const handleResize = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const active = document.activeElement;
      const isInputFocused = active && (
        active.tagName === 'INPUT' || 
        active.tagName === 'TEXTAREA' || 
        (active as HTMLElement).contentEditable === 'true'
      );

      // Height check: if visual viewport is significantly smaller than innerHeight, keyboard is open
      const isKeyboardActive = isInputFocused && (window.innerHeight - currentHeight > 150);

      if (isKeyboardActive) {
        document.documentElement.classList.add('keyboard-active');
      } else {
        document.documentElement.classList.remove('keyboard-active');
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, [appConfig]);

  return null;
}
