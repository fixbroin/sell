
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import WhatsAppTestSenderForm from './WhatsAppTestSenderForm';

export default function WhatsAppTestSenderTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Test WhatsApp Templates</CardTitle>
        <CardDescription>
          Select a template, fill in the parameters, and send a test message to a specified number to verify your integration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WhatsAppTestSenderForm />
      </CardContent>
    </Card>
  );
}
