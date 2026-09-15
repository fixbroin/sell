
"use client";

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, SendHorizonal, Trash2, PlusCircle, AlertTriangle, Check, ChevronsUpDown, Search } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const testSenderFormSchema = z.object({
  templateName: z.string({ required_error: "Please select a template."}),
  phoneNumber: z.string().min(12, "Phone number must be at least 12 digits including country code.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format."),
  params: z.array(z.object({ value: z.string().min(1, "Parameter cannot be empty.") })),
});

type TestSenderFormData = z.infer<typeof testSenderFormSchema>;

const approvedTemplates = [
  { name: 'user_welcome', params: 2, button: true, header: true },
  { name: 'booking_confirmed', params: 3, button: true, header: true },
  { name: 'booking_completed', params: 1, button: true, header: true },
  { name: 'booking_cancelled_1', params: 1, button: true, header: true },
  { name: 'payment_successful_1', params: 1, button: true, header: true },
];

export default function WhatsAppTestSenderForm() {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const filteredTemplates = approvedTemplates.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  useEffect(() => {
    if (!isTemplatePickerOpen) {
      setTemplateSearch("");
    }
  }, [isTemplatePickerOpen]);

  const form = useForm<TestSenderFormData>({
    resolver: zodResolver(testSenderFormSchema),
    defaultValues: { templateName: undefined, phoneNumber: "", params: [] },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "params",
  });

  const watchedTemplateName = form.watch("templateName");

  useEffect(() => {
    const template = approvedTemplates.find(t => t.name === watchedTemplateName);
    if (template) {
      let sampleParams: {value: string}[] = [];
      switch (template.name) {
        case 'user_welcome':
          sampleParams = [{ value: 'Srikanth Achari' }, { value: 'Yourbrand' }];
          break;
        case 'booking_confirmed':
          sampleParams = [{ value: 'Yourbrand-TEST-123' }, { value: 'Bed Assembly with Storage' }, { value: '25-07-2025' }];
          break;
        case 'booking_completed':
        case 'booking_cancelled_1':
        case 'payment_successful_1':
          sampleParams = [{ value: 'Yourbrand-TEST-123' }];
          break;
        default:
          sampleParams = Array(template.params).fill({ value: 'Sample Param' });
      }
      replace(sampleParams);
    } else {
      replace([]);
    }
  }, [watchedTemplateName, replace]);

  const onSubmit = async (data: TestSenderFormData) => {
    setIsSending(true);
    toast({ title: "Sending Test Message..." });
    
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: data.phoneNumber,
          templateName: data.templateName,
          parameters: data.params.map(p => p.value),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      toast({ title: "Success!", description: "Test message sent successfully.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error: any) {
      console.error("Error sending test WhatsApp message:", error);
      toast({
        title: "Failed to Send Message",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
        duration: 7000,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Alert variant="default" className="bg-blue-50 border-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600"/>
            <AlertTitle className="text-blue-800 font-bold">Integration Check</AlertTitle>
            <AlertDescription className="text-blue-700 text-xs">
                Ensure your WhatsApp credentials (Token and Phone ID) are configured in <strong>Marketing Settings</strong> or your environment file. 
                The <strong>Global WhatsApp Toggle</strong> must also be enabled.
            </AlertDescription>
        </Alert>

        <FormField
          control={form.control}
          name="templateName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Select Template</FormLabel>
              <Dialog open={isTemplatePickerOpen} onOpenChange={setIsTemplatePickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal h-10",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={isSending}
                    type="button"
                  >
                    {field.value ? field.value : "Choose a template to test"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Template</DialogTitle>
                    <DialogDescription>
                      Search and select an approved template to test.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="relative my-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search templates..."
                      className="pl-9 h-10"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                  </div>
                  <div className="py-2">
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        {filteredTemplates.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No templates found.</p>
                        ) : (
                          filteredTemplates.map((t) => (
                            <Button
                              key={t.name}
                              variant={field.value === t.name ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                              onClick={() => {
                                field.onChange(t.name);
                                setIsTemplatePickerOpen(false);
                              }}
                              type="button"
                            >
                              <span className="text-sm font-medium">{t.name}</span>
                              {field.value === t.name && (
                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {fields.map((field, index) => (
          <FormField
            key={field.id}
            control={form.control}
            name={`params.${index}.value`}
            render={({ field: itemField }) => (
              <FormItem>
                <FormLabel>Parameter {"{{"}{index + 1}{"}}"}</FormLabel>
                <FormControl>
                  <Input placeholder={`Value for parameter {{${index + 1}}}`} {...itemField} disabled={isSending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test Phone Number</FormLabel>
              <FormControl><Input placeholder="+91..." {...field} disabled={isSending} /></FormControl>
              <FormDescription>Include country code (e.g., +91).</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSending}>
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
          Send Test Message
        </Button>
      </form>
    </Form>
  );
}
