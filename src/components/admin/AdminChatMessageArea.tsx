
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Send, UserCircle, MessageSquareText, Loader2, Trash2 as TrashIcon, Bot, Info, ShieldCheck } from 'lucide-react';
import type { FirestoreUser, ChatMessage, ChatSession, FirestoreNotification } from '@/types/firestore';
import { Timestamp, doc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, setDoc, serverTimestamp, getDoc, getDocs, limit, writeBatch } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { triggerPushNotification } from '@/lib/fcmUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, getTimestampMillis } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminChatMessageAreaProps {
  selectedUser: FirestoreUser | null;
}

const ADMIN_FALLBACK_AVATAR_INITIAL_CHAT_AREA = "S";

const linkify = (text: string) => {
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, (url) => {
        const fullUrl = url.startsWith('www.') ? `http://${url}` : url;
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="text-primary font-medium underline hover:text-primary/80 transition-colors">${url}</a>`;
    });
};

export default function AdminChatMessageArea({ selectedUser }: AdminChatMessageAreaProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [isAiActive, setIsAiActive] = useState(true);
  const [isUpdatingAi, setIsUpdatingAi] = useState(false);
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user: loggedInAdminUser } = useAuth();
  const { toast } = useToast();

  const [supportAdminProfile, setSupportAdminProfile] = useState<{displayName?: string | null, photoURL?: string | null, uid: string | null}>({
    displayName: "Support", photoURL: null, uid: null
  });
  const [isLoadingSupportAdminProfile, setIsLoadingSupportAdminProfile] = useState(true);

  useEffect(() => {
    const fetchSupportAdminProfile = async () => {
      setIsLoadingSupportAdminProfile(true);
      try {
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminData = adminSnapshot.docs[0].data();
          const adminUid = adminSnapshot.docs[0].id;
          setSupportAdminProfile({
            displayName: adminData.displayName || "Support",
            photoURL: adminData.photoURL || null,
            uid: adminUid
          });
        } else {
          setSupportAdminProfile({ displayName: "Support", photoURL: null, uid: 'fallback_admin_uid' });
        }
      } catch (error) {
        setSupportAdminProfile({ displayName: "Support", photoURL: null, uid: 'fallback_admin_uid' });
      } finally {
        setIsLoadingSupportAdminProfile(false);
      }
    };
    fetchSupportAdminProfile();
  }, []);

  const getChatSessionId = useCallback((userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
  }, []);

  const currentChatSessionId = selectedUser && supportAdminProfile.uid ? getChatSessionId(selectedUser.id, supportAdminProfile.uid) : null;

  useEffect(() => {
    if (currentChatSessionId && selectedUser && !isLoadingSupportAdminProfile) {
      setIsLoadingMessages(true);
      
      const sessionDocRef = doc(db, 'chats', currentChatSessionId);
      const unsubSession = onSnapshot(sessionDocRef, (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data() as ChatSession;
              setIsAiActive(data.aiAgentActive !== false);
          }
      });

      const messagesRef = collection(db, 'chats', currentChatSessionId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, async (querySnapshot) => {
        const fetchedMessages = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ChatMessage));
        setMessages(fetchedMessages);
        setIsLoadingMessages(false);

        const batch = writeBatch(db);
        let messagesMarkedRead = false;
        for (const msg of fetchedMessages) {
          if (msg.senderType === 'user' && !msg.isReadByAdmin && msg.id) {
            const msgRef = doc(db, 'chats', currentChatSessionId, 'messages', msg.id);
            batch.update(msgRef, { isReadByAdmin: true });
            messagesMarkedRead = true;
          }
        }
        if (messagesMarkedRead) {
          await batch.commit();
        }

        if (selectedUser && supportAdminProfile.uid) {
            await setDoc(sessionDocRef, {
                userId: selectedUser.id,
                adminId: supportAdminProfile.uid,
                adminUnreadCount: 0,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                participants: [selectedUser.id, supportAdminProfile.uid].filter(Boolean),
            }, { merge: true });
        }
      }, (error) => {
        console.error("Error fetching messages:", error);
        setIsLoadingMessages(false);
      });

      return () => {
          unsubscribe();
          unsubSession();
      };
    } else {
      setMessages([]);
      if (!isLoadingSupportAdminProfile) setIsLoadingMessages(false);
    }
  }, [currentChatSessionId, selectedUser, isLoadingSupportAdminProfile, supportAdminProfile.uid]);

  useEffect(() => {
    if (scrollAreaRootRef.current) {
      const viewport = scrollAreaRootRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, isLoadingMessages]);

  const handleToggleAi = async (checked: boolean) => {
      if (!currentChatSessionId) return;
      setIsUpdatingAi(true);
      try {
          const sessionDocRef = doc(db, 'chats', currentChatSessionId);
          await updateDoc(sessionDocRef, { aiAgentActive: checked, updatedAt: serverTimestamp() });
          toast({ 
              title: checked ? "AI Agent Enabled" : "AI Agent Disabled", 
              description: `The bot is now ${checked ? 'managing' : 'paused for'} this conversation.` 
          });
      } catch (error) {
          console.error("Error toggling AI status:", error);
          toast({ title: "Update Failed", description: "Could not update bot status.", variant: "destructive" });
      } finally {
          setIsUpdatingAi(false);
      }
  };

  // Auto-resize textarea height
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '48px'; // Default/minimum height (matching h-12)
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [newMessage]);

  // Handle enter key submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !loggedInAdminUser || !currentChatSessionId || !supportAdminProfile.uid) return;

    const messageData: Omit<ChatMessage, 'id'> = {
      chatSessionId: currentChatSessionId,
      senderId: supportAdminProfile.uid,
      senderType: 'admin',
      text: newMessage,
      timestamp: Timestamp.now(),
      isReadByUser: false, 
    };

    const tempNewMessage = newMessage;
    setNewMessage('');
    inputRef.current?.blur();

    // Instantly append to local messages array for 0ms response
    const optimisticMessage: ChatMessage = {
      id: `temp_${Date.now()}`,
      ...messageData
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const messagesRef = collection(db, 'chats', currentChatSessionId, 'messages');
      await addDoc(messagesRef, messageData);

      const sessionDocRef = doc(db, 'chats', currentChatSessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      const currentSessionData = sessionSnap.exists() ? sessionSnap.data() as ChatSession : undefined;
      const currentUserUnreadCount = currentSessionData?.userUnreadCount || 0;

      await setDoc(sessionDocRef, {
        userId: selectedUser.id,
        userName: selectedUser.displayName || null,
        userPhotoUrl: selectedUser.photoURL || null,
        adminId: supportAdminProfile.uid,
        adminName: supportAdminProfile.displayName || null,
        adminPhotoUrl: supportAdminProfile.photoURL || null,
        lastMessageText: tempNewMessage.substring(0, 50),
        lastMessageTimestamp: messageData.timestamp,
        lastMessageSenderId: supportAdminProfile.uid,
        participants: [selectedUser.id, supportAdminProfile.uid].filter(p => p !== null && p !== undefined),
        userUnreadCount: currentUserUnreadCount + 1,
        adminUnreadCount: 0,
        aiAgentActive: false,
        updatedAt: messageData.timestamp,
        ...(currentSessionData ? {} : { createdAt: messageData.timestamp })
      }, { merge: true });
      
      const userNotificationData: FirestoreNotification = {
        userId: selectedUser.id,
        title: `New Message from ${supportAdminProfile.displayName || "Support"}`,
        message: `You have a new message: "${tempNewMessage.substring(0, 30)}${tempNewMessage.length > 30 ? "..." : ""}"`,
        type: 'info',
        href: '/chat',
        read: false,
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, "userNotifications"), userNotificationData);

      triggerPushNotification({
        userId: selectedUser.id,
        title: `Message from ${supportAdminProfile.displayName || "Support"}`,
        body: tempNewMessage,
        href: '/chat'
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleClearChat = async () => {
    if (!currentChatSessionId || !selectedUser) return;
    setIsClearingChat(true);
    try {
      const messagesQuery = query(collection(db, 'chats', currentChatSessionId, 'messages'));
      const messagesSnapshot = await getDocs(messagesQuery);
      const batch = writeBatch(db);
      messagesSnapshot.forEach(docSnapshot => batch.delete(docSnapshot.ref));

      const sessionDocRef = doc(db, 'chats', currentChatSessionId);
      batch.update(sessionDocRef, {
        lastMessageText: "Chat history cleared.",
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSenderId: supportAdminProfile.uid || null,
        userUnreadCount: 0,
        adminUnreadCount: 0,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      toast({ title: "Chat Cleared" });
    } catch (error) {
      toast({ title: "Error Clearing Chat", variant: "destructive" });
    } finally {
      setIsClearingChat(false);
    }
  };

  if (!selectedUser) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-muted/5">
        <div className="bg-card p-12 rounded-3xl shadow-sm border flex flex-col items-center max-w-sm text-center">
          <div className="bg-primary/10 p-5 rounded-full mb-6">
            <MessageSquareText className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-2">No Conversation Selected</h3>
          <p className="text-muted-foreground text-sm">Select a user from the sidebar to view their message history and start chatting.</p>
        </div>
      </div>
    );
  }

  if (!loggedInAdminUser || isLoadingSupportAdminProfile || !supportAdminProfile.uid) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Synchronizing admin profile...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background relative">
      <header className="p-4 border-b bg-card/50 backdrop-blur-md sticky top-0 z-20 shrink-0 cursor-pointer" onClick={() => inputRef.current?.blur()}>
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                    <AvatarImage src={selectedUser.photoURL || undefined} alt={selectedUser.displayName || selectedUser.email || ""} />
                    <AvatarFallback className="bg-primary/5 text-primary font-bold">
                        {selectedUser.displayName ? selectedUser.displayName.charAt(0).toUpperCase() : <UserCircle size={20}/>}
                    </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-green-500 border-2 border-background rounded-full" />
              </div>
              <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold truncate max-w-[150px]">{selectedUser.displayName || selectedUser.email}</h3>
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{selectedUser.email}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 md:space-x-4">
              <div className={cn(
                "flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all duration-300",
                isAiActive ? "bg-primary/10 border-primary/30" : "bg-muted/50 border-muted-foreground/20"
              )}>
                <Bot className={cn("h-4 w-4", isAiActive ? "text-primary animate-bounce" : "text-muted-foreground")} />
                <Label htmlFor="ai-toggle" className="text-[10px] font-bold cursor-pointer select-none uppercase tracking-wider">AI Support</Label>
                <Switch 
                  id="ai-toggle" 
                  checked={isAiActive} 
                  onCheckedChange={handleToggleAi} 
                  disabled={isUpdatingAi}
                  className="scale-75"
                />
              </div>

              <AlertDialog>
              <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full shrink-0" disabled={isClearingChat || messages.length === 0}>
                    {isClearingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                  </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-xl font-bold">Clear Chat History?</AlertDialogTitle>
                    <AlertDialogDescription className="text-sm">
                      This will permanently remove all messages for this user. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Keep Chat</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearChat} className="bg-destructive hover:bg-destructive/90 rounded-full">
                      Delete Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
              </AlertDialog>
            </div>
        </div>
      </header>

      <ScrollArea className="flex-grow p-4 cursor-pointer" ref={scrollAreaRootRef} onClick={() => inputRef.current?.blur()}>
        <div className="max-w-4xl mx-auto space-y-6 py-4">
          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-64 space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
              <p className="text-sm font-medium text-muted-foreground">Fetching messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/20 rounded-3xl border border-dashed">
              <div className="bg-background p-3 rounded-full mb-3 shadow-sm">
                <Info className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No message history yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Start the conversation below.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, idx) => {
                const isMe = msg.senderType === 'admin';
                const isAi = msg.senderType === 'ai';
                const showAvatar = idx === 0 || messages[idx-1].senderType !== msg.senderType;

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-end space-x-2 group",
                      isMe ? "justify-end" : "justify-start"
                    )}
                  >
                    {!isMe && showAvatar && (
                      <Avatar className="h-8 w-8 shrink-0 mb-1 shadow-sm border border-background">
                        <AvatarFallback className={cn("text-[10px] font-bold", isAi ? "bg-zinc-900 text-white" : "bg-primary/10 text-primary")}>
                          {isAi ? <Bot className="h-4 w-4" /> : (selectedUser.displayName?.charAt(0) || 'U')}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {!isMe && !showAvatar && <div className="w-8 shrink-0" />}

                    <div className={cn(
                      "flex flex-col max-w-[80%] group",
                      isMe ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "p-3.5 px-4 shadow-sm relative",
                        isMe 
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-br-none" 
                          : isAi 
                            ? "bg-zinc-100 dark:bg-zinc-800 text-foreground rounded-2xl rounded-bl-none border border-zinc-200 dark:border-zinc-700"
                            : "bg-card text-foreground rounded-2xl rounded-bl-none border"
                      )}>
                        {msg.text && (
                          <div 
                            className="text-sm leading-relaxed whitespace-pre-wrap" 
                            dangerouslySetInnerHTML={{ __html: linkify(msg.text) }}
                          />
                        )}
                        <span className={cn(
                          "text-[9px] mt-1.5 block font-medium opacity-60",
                          isMe ? "text-right" : "text-left"
                        )}>
                          {(() => {
                              const millis = getTimestampMillis(msg.timestamp);
                              return millis ? new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                          })()}
                        </span>
                      </div>
                    </div>

                    {isMe && showAvatar && (
                      <Avatar className="h-8 w-8 shrink-0 mb-1 shadow-sm border border-background">
                        <AvatarImage src={supportAdminProfile?.photoURL || undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                          {ADMIN_FALLBACK_AVATAR_INITIAL_CHAT_AREA}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {isMe && !showAvatar && <div className="w-8 shrink-0" />}
                  </div>
                );
              })}
              {isLoadingMessages && messages.length > 0 && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="p-4 border-t bg-card/80 backdrop-blur-md sticky bottom-0 z-20 shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center space-x-2">
          <div className="relative flex-grow group">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              className="w-full pr-12 pl-4 py-3.5 bg-muted/30 border-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 h-12 rounded-2xl text-sm transition-all resize-none no-keyboard-scroll overflow-y-auto"
              disabled={isLoadingMessages || isLoadingSupportAdminProfile}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              <div className={cn(
                "h-2 w-2 rounded-full mr-2 transition-all duration-500",
                newMessage.trim() ? "bg-primary scale-110 shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-muted scale-75"
              )} />
            </div>
          </div>
          <Button 
            type="submit" 
            size="icon" 
            className={cn(
              "h-12 w-12 rounded-2xl shadow-lg transition-all duration-300",
              newMessage.trim() ? "bg-primary hover:bg-primary/90 scale-100" : "bg-muted text-muted-foreground scale-95 opacity-50"
            )}
            disabled={!newMessage.trim() || isLoadingMessages || isLoadingSupportAdminProfile}
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
