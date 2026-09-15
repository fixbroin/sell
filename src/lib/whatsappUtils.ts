"use client";

/**
 * Global utility to open WhatsApp with a selection modal for Personal vs Business accounts.
 * On Android, this uses package-specific intents to force opening the chosen app directly.
 * On other platforms, it uses universal links.
 */
export function openWhatsAppChooser(phone: string, message: string) {
  if (typeof window === 'undefined') return;

  // Sanitize phone number (remove non-digits, ensure country code 91 is prepended if missing)
  const sanitizedPhone = phone.replace(/\D/g, '');
  const internationalPhone = sanitizedPhone.startsWith('91') 
    ? sanitizedPhone 
    : sanitizedPhone.length === 10 
      ? `91${sanitizedPhone}` 
      : sanitizedPhone;

  const encodedText = encodeURIComponent(message);
  const isAndroid = /Android/i.test(navigator.userAgent);

  // Personal WhatsApp target link
  const personalLink = isAndroid
    ? `intent://send?phone=${internationalPhone}&text=${encodedText}#Intent;package=com.whatsapp;scheme=whatsapp;end`
    : `https://wa.me/${internationalPhone}?text=${encodedText}`;

  // WhatsApp Business target link
  const businessLink = isAndroid
    ? `intent://send?phone=${internationalPhone}&text=${encodedText}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`
    : `https://wa.me/${internationalPhone}?text=${encodedText}`;

  // Remove any stale modal if it exists
  const modalId = 'global-whatsapp-chooser-modal';
  const existingModal = document.getElementById(modalId);
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal element
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.zIndex = '2147483647';
  modal.style.pointerEvents = 'auto';
  // Styled with Tailwind classes matching the project theme
  modal.className = "fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200";

  const content = document.createElement('div');
  content.className = "bg-background border border-muted rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-3 space-y-5 text-center text-foreground animate-in zoom-in-95 duration-200";
  content.style.pointerEvents = 'auto';

  content.innerHTML = `
    <div class="space-y-1.5" style="pointer-events: auto;">
      <h3 class="text-lg font-black tracking-tight" style="pointer-events: auto;">Choose WhatsApp</h3>
      <p class="text-xs text-muted-foreground leading-normal" style="pointer-events: auto;">Which WhatsApp account would you like to use to send this message?</p>
    </div>
    
    <div class="flex flex-col gap-2.5" style="pointer-events: auto;">
      <button id="wa-personal-btn" style="pointer-events: auto;" class="w-full h-11 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-black text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-xs">
        WhatsApp Messenger
      </button>
      <button id="wa-business-btn" style="pointer-events: auto;" class="w-full h-11 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-50 hover:text-white font-black text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-xs">
        WhatsApp Business
      </button>
    </div>

    <button id="wa-cancel-btn" style="pointer-events: auto;" class="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors self-center pt-1">
      Cancel
    </button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // Close helper
  const closeModal = () => {
    modal.classList.add('fade-out');
    content.classList.add('zoom-out-95');
    setTimeout(() => {
      modal.remove();
    }, 200);
  };

  // Click handlers
  document.getElementById('wa-personal-btn')?.addEventListener('click', () => {
    window.open(personalLink, '_blank');
    closeModal();
  });

  document.getElementById('wa-business-btn')?.addEventListener('click', () => {
    window.open(businessLink, '_blank');
    closeModal();
  });

  document.getElementById('wa-cancel-btn')?.addEventListener('click', closeModal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}
