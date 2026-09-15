'use server';

import React from 'react';
import EmailSettingsClient from './EmailSettingsClient';
import { getEmailTemplatesAction } from '@/app/actions/emailSettingsActions';

export default async function EmailSettingsPage() {
  const initialTemplates = await getEmailTemplatesAction();

  return (
    <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6">
      <div className="space-y-1">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Email Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Manage system notification templates, subjects, and enable or disable specific notifications.
        </p>
      </div>
      <EmailSettingsClient initialTemplates={initialTemplates} />
    </div>
  );
}
