'use server';

import React from 'react';
import PushSettingsClient from './PushSettingsClient';
import { getPushTemplatesAction } from '@/app/actions/pushSettingsActions';

export default async function PushSettingsPage() {
  const initialTemplates = await getPushTemplatesAction();

  return (
    <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6">
      <div className="space-y-1">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Push Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Configure dynamic push notification settings and toggle push alerts on/off for specific events.
        </p>
      </div>
      <PushSettingsClient initialTemplates={initialTemplates} />
    </div>
  );
}
