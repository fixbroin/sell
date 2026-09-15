"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, UserCircle, MessageSquareText, XIcon, Loader2, Check, CheckCheck, Bot } from 'lucide-react';
import type { ChatMessage, ChatSession, FirestoreNotification } from '@/types/firestore';
import { Timestamp, doc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, setDoc, serverTimestamp, getDoc, getDocs, limit } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { CANONICAL_SUPPORT_ADMIN_UID } from '@/components/admin/AdminUserListForChat';
import { chatWithAgent, type ChatHistoryItem } from '@/ai/flows/chatWithAgentFlow';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { cn, getTimestampMillis } from '@/lib/utils';

interface ChatWindowProps {
  onClose: () => void;
}

const ADMIN_FALLBACK_NAME = "Support";
const ADMIN_FALLBACK_AVATAR_INITIAL = "S";

import { safeFormatChatMessage } from '@/lib/chatSanitizer';

// Safe chat message formatter preventing stored/DOM-based XSS
const formatChatMessage = safeFormatChatMessage;


export default function ChatWindow({ onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isAdminTyping, setIsAdminTyping] = useState(false);
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportOffset, setViewportOffset] = useState<number>(0);
  const { user: currentUser } = useAuth();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserTypingReportRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        setViewportOffset(window.visualViewport.offsetTop);
      }
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setTimeout(() => {
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 800); // 800ms gives ample time for Firebase connection and page layout to stabilize
    }
  }, []);

  const handleFocus = () => {
    if (window.innerWidth < 768) {
      setTimeout(() => {
        if (scrollAreaRootRef.current) {
          const viewport = scrollAreaRootRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
          if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
          }
        }
      }, 150);
    }
  };


  const [adminProfile, setAdminProfile] = useState<{displayName?: string | null, photoURL?: string | null, uid?: string | null}>({
    displayName: ADMIN_FALLBACK_NAME,
    photoURL: null,
    uid: null,
  });
  const [isLoadingAdminProfile, setIsLoadingAdminProfile] = useState(true);

  useEffect(() => {
    if (globalSettings?.chatNotificationSoundUrl) {
      audioRef.current = new Audio(globalSettings.chatNotificationSoundUrl);
      audioRef.current.load();
    } else {
      audioRef.current = null;
    }
  }, [globalSettings?.chatNotificationSoundUrl]);


  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const getChatSessionId = useCallback((userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
  }, []);

  const chatSessionId = currentUser && adminProfile.uid ? getChatSessionId(currentUser.uid, adminProfile.uid) : null;

  useEffect(() => {
    const fetchAdminProfile = async () => {
        setIsLoadingAdminProfile(true);
      if (globalSettings?.adminUserUidForChat) {
         const adminDocSnap = await getDoc(doc(db, "users", globalSettings.adminUserUidForChat));
         if (adminDocSnap.exists()) {
            const adminData = adminDocSnap.data();
            setAdminProfile({ displayName: adminData.displayName, photoURL: adminData.photoURL, uid: adminDocSnap.id });
            setIsLoadingAdminProfile(false);
            return;
         }
      }
      const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
      const adminSnapshot = await getDocs(adminQuery);
      if (!adminSnapshot.empty) {
        const adminData = adminSnapshot.docs[0].data();
        const adminUid = adminSnapshot.docs[0].id;
        setAdminProfile({ displayName: adminData.displayName || null, photoURL: adminData.photoURL || null, uid: adminUid });
      } else {
        setAdminProfile({ displayName: ADMIN_FALLBACK_NAME, photoURL: null, uid: 'admin_master_id' });
      }
      setIsLoadingAdminProfile(false);
    };

    if (!isLoadingGlobalSettings) {
        fetchAdminProfile();
    }
  }, [globalSettings, isLoadingGlobalSettings]);


  useEffect(() => {
    if (!currentUser || !chatSessionId || !adminProfile.uid || isLoadingAdminProfile) {
      if(!isLoadingAdminProfile && !adminProfile.uid) setIsLoadingMessages(false);
      return;
    }
    setIsLoadingMessages(true);
    const messagesRef = collection(db, 'chats', chatSessionId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const fetchedMessages = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ChatMessage));
      
      let newAdminMessageReceived = false;
      for (const msg of fetchedMessages) {
        if (msg.senderType === 'admin' && !msg.isReadByUser && msg.id) {
          newAdminMessageReceived = true;
          break; 
        }
      }

      setMessages(fetchedMessages);
      setIsLoadingMessages(false);

      for (const msg of fetchedMessages) {
        if (msg.senderType === 'admin' && !msg.isReadByUser && msg.id) {
          const msgRef = doc(db, 'chats', chatSessionId, 'messages', msg.id);
          await updateDoc(msgRef, { isReadByUser: true });
        }
      }

      if (newAdminMessageReceived && audioRef.current) {
        audioRef.current.play().catch(e => console.warn("ChatWindow: Audio play failed:", e));
      }
      
      const sessionDocRef = doc(db, 'chats', chatSessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      if (sessionSnap.exists()) {
        await updateDoc(sessionDocRef, { userUnreadCount: 0, updatedAt: serverTimestamp() });
      } else if (currentUser && adminProfile.uid) {
        await setDoc(sessionDocRef, {
            userId: currentUser.uid,
            adminId: adminProfile.uid,
            userUnreadCount: 0,
            aiAgentActive: true, 
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            participants: [currentUser.uid, adminProfile.uid].filter(Boolean),
        }, { merge: true });
      }

      // Real-time listener for Admin Typing indication
      const unsubSession = onSnapshot(sessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as ChatSession;
          const adminTypingAt = data.adminTypingAt ? getTimestampMillis(data.adminTypingAt) : 0;
          const isRecent = adminTypingAt ? (Date.now() - adminTypingAt < 5000) : false;
          setIsAdminTyping(Boolean(data.isAdminTyping && (isRecent || !data.adminTypingAt)));
        } else {
          setIsAdminTyping(false);
        }
      });

      return () => {
        unsubscribe();
        unsubSession();
      };
    }, (error) => {
      console.error(`ChatWindow: Error fetching messages for session ${chatSessionId}:`, error);
      setIsLoadingMessages(false);
    });

    return () => {
        unsubscribe();
    };
  }, [currentUser, chatSessionId, adminProfile.uid, isLoadingAdminProfile]);

  const reportUserTyping = useCallback((isTyping: boolean) => {
    if (!chatSessionId || !currentUser) return;
    try {
      const sessionDocRef = doc(db, 'chats', chatSessionId);
      setDoc(sessionDocRef, {
        isUserTyping: isTyping,
        userTypingAt: isTyping ? Date.now() : null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("ChatWindow: Error reporting user typing:", e);
    }
  }, [chatSessionId, currentUser]);

  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewMessage(val);

    if (val.trim()) {
      const now = Date.now();
      if (now - lastUserTypingReportRef.current > 2000) {
        lastUserTypingReportRef.current = now;
        reportUserTyping(true);
      }

      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      userTypingTimeoutRef.current = setTimeout(() => {
        reportUserTyping(false);
      }, 3000);
    } else {
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      reportUserTyping(false);
    }
  };

  const handleBlur = () => {
    if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
    reportUserTyping(false);
  };

  useEffect(() => {
    const handleLeave = () => {
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      if (chatSessionId && currentUser) {
        reportUserTyping(false);
        try {
          fetch('/api/db/mutate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'setDoc',
              path: 'chats',
              id: chatSessionId,
              data: { isUserTyping: false, userTypingAt: null },
              options: { merge: true }
            }),
            keepalive: true
          });
        } catch (e) {
          // ignore unload error
        }
      }
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);

    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      if (chatSessionId && currentUser) {
        reportUserTyping(false);
      }
    };
  }, [chatSessionId, currentUser, reportUserTyping]);

  useEffect(() => {
    if (scrollAreaRootRef.current) {
      const viewport = scrollAreaRootRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isLoadingMessages, isAiTyping, isAdminTyping]);

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
    if (!newMessage.trim() || !currentUser || !chatSessionId || !adminProfile.uid) {
        return;
    }
    if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
    reportUserTyping(false);

    const messageData: Omit<ChatMessage, 'id'> = {
      chatSessionId: chatSessionId,
      senderId: currentUser.uid,
      senderType: 'user',
      text: newMessage,
      timestamp: Timestamp.now(),
      isReadByAdmin: false,
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
      const sessionDocRef = doc(db, 'chats', chatSessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      const currentSessionData = sessionSnap.exists() ? sessionSnap.data() as ChatSession : undefined;
      const currentAdminUnreadCount = currentSessionData?.adminUnreadCount || 0;
      
      const isGlobalAiEnabled = globalSettings?.isAiChatBotEnabled ?? false;

      // 1. Create/Update the Session Document FIRST so rules can find the participants
      await setDoc(sessionDocRef, {
        userId: currentUser.uid,
        userName: currentUser.displayName || null,
        userPhotoUrl: currentUser.photoURL || null,
        adminId: adminProfile.uid,
        adminName: adminProfile.displayName || null,
        adminPhotoUrl: adminProfile.photoURL || null,
        lastMessageText: tempNewMessage.substring(0, 50),
        lastMessageTimestamp: messageData.timestamp,
        lastMessageSenderId: currentUser.uid,
        participants: [currentUser.uid, adminProfile.uid].filter(p => p !== null && p !== undefined),
        userUnreadCount: 0,
        adminUnreadCount: currentAdminUnreadCount + 1,
        isUserTyping: false,
        userTypingAt: null,
        updatedAt: messageData.timestamp,
        ...(currentSessionData ? {} : { createdAt: messageData.timestamp })
      }, { merge: true });

      // 2. Now add the message to the subcollection
      const messagesRef = collection(db, 'chats', chatSessionId, 'messages');
      await addDoc(messagesRef, messageData);
      
      if (adminProfile.uid && adminProfile.uid !== 'fallback_admin_uid' && adminProfile.uid !== 'admin_master_id') {
        const adminNotificationData: FirestoreNotification = {
          userId: adminProfile.uid,
          title: `New Chat Message from ${currentUser.displayName || currentUser.email}`,
          message: `User ${currentUser.displayName || currentUser.email} sent: "${tempNewMessage.substring(0, 30)}${tempNewMessage.length > 30 ? "..." : ""}"`,
          type: 'admin_alert',
          href: '/admin/chat',
          read: false,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), adminNotificationData);
        
        // Trigger actual Push Notification for admin
        triggerPushNotification({
          userId: adminProfile.uid,
          title: `Message from ${currentUser.displayName || currentUser.email}`,
          body: tempNewMessage,
          href: '/admin/chat',
          variables: {
            senderName: currentUser.displayName || currentUser.email || 'Customer',
            messageText: tempNewMessage,
            siteName: 'Yourbrand'
          }
        });
      }
      
      if (isGlobalAiEnabled) {
        setIsAiTyping(true);
        // Correctly format history for the AI
        const MAX_HISTORY = 16;
        const trimmed = messages.slice(-MAX_HISTORY);

        const historyForAi: ChatHistoryItem[] = trimmed.map(msg => ({
          role: msg.senderType === 'user' ? 'user' : 'model',
          content: [{ text: msg.text || '' }]
        }));

        const aiResponse = await chatWithAgent({
          history: historyForAi,
          message: tempNewMessage,
          userId: currentUser.uid, // VERY IMPORTANT
        });
        setIsAiTyping(false);

        if (aiResponse.response && aiResponse.isSilent !== true) {
          const aiMessageData: Omit<ChatMessage, 'id'> = {
            chatSessionId: chatSessionId,
            senderId: 'ai_agent',
            senderType: 'ai',
            text: aiResponse.response,
            timestamp: Timestamp.now(),
            isReadByUser: false,
          };
          // The onSnapshot listener will pick this up automatically.
          await addDoc(messagesRef, aiMessageData);
          
          // Create notification for the user for AI response
          const aiNotificationData: FirestoreNotification = {
            userId: currentUser.uid,
            title: `New Message from ${adminProfile.displayName || "Support"} AI`,
            message: `${aiResponse.response.substring(0, 30)}${aiResponse.response.length > 30 ? "..." : ""}`,
            type: 'info',
            href: '/chat',
            read: false,
            createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), aiNotificationData);

          // Trigger actual Push Notification for user from AI
          triggerPushNotification({
            userId: currentUser.uid,
            title: `Support AI: ${adminProfile.displayName || "Support"}`,
            body: aiResponse.response,
            href: '/chat'
          });

          await updateDoc(sessionDocRef, {
              lastMessageText: aiResponse.response.substring(0, 50),
              lastMessageTimestamp: aiMessageData.timestamp,
              lastMessageSenderId: 'ai_agent',
              userUnreadCount: (currentSessionData?.userUnreadCount || 0) + 1,
              updatedAt: aiMessageData.timestamp,
          });
        }
      }

    } catch (error) {
      console.error("ChatWindow: Error sending message:", error);
      setIsAiTyping(false);
    }
  };

  if (!currentUser) {
    return (
      <Card className="h-full flex flex-col shadow-xl rounded-2xl border-none overflow-hidden bg-background">
        <CardHeader className="p-4 border-b bg-primary/5 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg font-headline font-semibold">Chat Support</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors">
            <XIcon className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
             <MessageSquareText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">Please login to start a conversation with our support team.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingGlobalSettings || isLoadingAdminProfile || !adminProfile.uid) {
     return (
      <Card className="h-full flex flex-col shadow-xl rounded-2xl border-none overflow-hidden bg-background">
        <CardHeader className="p-4 border-b bg-primary/5 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-3">
             <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
             <div className="space-y-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
             </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <XIcon className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground animate-pulse">Initializing secure connection...</p>
          </div>
        </CardContent>
      </Card>
     );
  }

  if (!adminProfile.uid || adminProfile.uid === 'fallback_admin_uid' || adminProfile.uid === 'admin_master_id') {
    return (
      <Card className="h-full flex flex-col shadow-xl rounded-2xl border-none overflow-hidden bg-background">
        <CardHeader className="p-4 border-b bg-destructive/5 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-3">
             <MessageSquareText className="h-6 w-6 text-destructive" />
            <CardTitle className="text-lg font-headline font-semibold">Support Unavailable</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full"><XIcon className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <XIcon className="h-8 w-8 text-destructive" />
          </div>
          <p className="text-destructive font-medium mb-2">Configuration Error</p>
          <p className="text-muted-foreground text-sm max-w-xs">The support chat is currently unavailable. Our team is working to resolve this. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card 
      className="h-full flex flex-col shadow-2xl rounded-2xl border-none overflow-hidden bg-background ring-1 ring-border no-keyboard-scroll"
      style={viewportHeight && window.innerWidth < 768 ? { 
        position: 'fixed', 
        top: `${viewportOffset}px`, 
        left: 0, 
        right: 0, 
        height: `${viewportHeight}px`, 
        zIndex: 50, 
        borderRadius: 0 
      } : undefined}
    >
      <CardHeader 
        className="p-4 border-b bg-background sticky top-0 z-10 flex flex-row items-center justify-between cursor-pointer"
        onClick={() => inputRef.current?.blur()}
      >
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Avatar className="h-10 w-10 border-2 border-primary/10 ring-2 ring-background">
              <AvatarImage src={adminProfile.photoURL || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {adminProfile.displayName?.charAt(0) || ADMIN_FALLBACK_AVATAR_INITIAL}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white" />
          </div>
          <div className="flex flex-col">
            <CardTitle className="text-base font-headline font-bold leading-tight">
              {adminProfile.displayName || ADMIN_FALLBACK_NAME}
            </CardTitle>
            {isAdminTyping ? (
              <span className="text-[10px] text-primary font-bold uppercase tracking-wider flex items-center animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mr-1.5 animate-ping" />
                typing...
              </span>
            ) : (
              <span className="text-[10px] text-green-600 font-semibold uppercase tracking-wider flex items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                Online Support
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-destructive/10 hover:text-destructive transition-all duration-200">
          <XIcon className="h-5 w-5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0 flex-grow overflow-hidden relative bg-background">
       
        
        <ScrollArea className="h-full px-4 py-6 cursor-pointer" ref={scrollAreaRootRef} onClick={() => inputRef.current?.blur()}>
          {isLoadingMessages ? (
            <div className="flex flex-col justify-center items-center h-full space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                <p className="text-xs text-muted-foreground">Syncing conversation...</p>
            </div>
          ) : messages.length === 0 && !isAiTyping ? (
             <div className="flex flex-col justify-center items-center h-full text-center space-y-4 px-6 mt-10">
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 animate-in fade-in zoom-in duration-500">
                  <Bot className="h-10 w-10 text-primary mb-2 mx-auto" />
                  <h3 className="text-sm font-semibold text-foreground">Welcome to Yourbrand Support!</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">How can we help you with your bookings or services today?</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-[calc(100%-6px)]">
                    <Button variant="outline" size="sm" className="text-[10px] h-auto py-2 rounded-xl" onClick={() => setNewMessage("Hello! I need help with my booking.")}>Help with booking</Button>
                    <Button variant="outline" size="sm" className="text-[10px] h-auto py-2 rounded-xl" onClick={() => setNewMessage("Can you tell me more about services?")}>Service info</Button>
                </div>
             </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, index) => {
                const isUser = msg.senderType === 'user';
                const isAi = msg.senderType === 'ai';
                
                return (
                  <div
                    key={msg.id || `msg-${index}`}
                    className={cn(
                      "flex items-start gap-2.5 group animate-in slide-in-from-bottom-2 duration-300",
                      isUser ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {!isUser && (
  <Avatar className="h-8 w-8 mt-1 border shadow-sm flex-shrink-0">
    <AvatarImage src={isAi ? "/default-image.png" : adminProfile.photoURL || undefined} />
    <AvatarFallback className={isAi ? "bg-background text-foreground" : "bg-primary/10 text-primary"}>
      {isAi ? <Bot className="h-4 w-4" /> : adminProfile.displayName?.charAt(0) || ADMIN_FALLBACK_AVATAR_INITIAL}
    </AvatarFallback>
  </Avatar>
)}
                    
                    <div className={cn("flex flex-col space-y-1 max-w-[75%]", isUser ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "relative px-3 py-2 rounded-lg text-sm shadow-sm transition-all",
                          isUser 
                            ? "bg-primary text-primary-foreground rounded-br-none" 
                            : "bg-secondary text-secondary-foreground rounded-bl-none border border-border/40"
                        )}
                      >
                        {msg.text && (
                          <div 
                            className="whitespace-pre-wrap leading-relaxed" 
                            dangerouslySetInnerHTML={{ __html: formatChatMessage(msg.text) }} 
                          />
                        )}
                      </div>
                      
                      <div className={cn("flex items-center space-x-1 px-1", isUser ? "flex-row-reverse" : "flex-row")}>
                        <p className="text-[10px] font-medium text-muted-foreground/60">
                          {(() => {
                          const millis = getTimestampMillis(msg.timestamp);
                          return millis ? new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        })()}
                        </p>
                        {isUser && (
                          <div className="ml-1">
                            {msg.isReadByAdmin ? (
                              <CheckCheck className="h-3 w-3 text-blue-500" />
                            ) : (
                              <Check className="h-3 w-3 text-muted-foreground/40" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {isAiTyping && (
                <div className="flex items-start gap-2.5 animate-in fade-in duration-300">
                  <Avatar className="h-8 w-8 mt-1 border shadow-sm flex-shrink-0 ring-1 ring-border">
                    <AvatarFallback className="bg-background text-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-secondary text-secondary-foreground border border-border/40 rounded-lg rounded-bl-none px-3 py-2.5 shadow-sm">
                    <div className="flex items-center space-x-1.5">
                      <span className="h-1.5 w-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-1.5 w-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-1.5 w-1.5 bg-muted-foreground/60 rounded-full animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}

              {isAdminTyping && (
                <div className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Avatar className="h-8 w-8 mt-1 border shadow-sm flex-shrink-0 ring-1 ring-border">
                    <AvatarImage src={adminProfile.photoURL || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {adminProfile.displayName?.charAt(0) || ADMIN_FALLBACK_AVATAR_INITIAL}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-1">
                    <span className="text-[10px] text-muted-foreground font-medium pl-1">
                      {adminProfile.displayName || ADMIN_FALLBACK_NAME} is typing...
                    </span>
                    <div className="bg-secondary text-secondary-foreground border border-border/40 rounded-2xl rounded-bl-none px-3.5 py-2.5 shadow-sm w-fit">
                      <div className="flex items-center space-x-1.5">
                        <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce"></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="p-4 border-t bg-background">
        <form onSubmit={handleSendMessage} className="flex w-full items-center gap-3">
          <div className="relative flex-grow group">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={handleUserInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Type your message here..."
              className="w-full pr-10 pl-4 py-3.5 rounded-2xl bg-muted/50 border-none focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 transition-all text-sm h-12 resize-none no-keyboard-scroll overflow-y-auto"
              disabled={isLoadingMessages || isLoadingGlobalSettings || isLoadingAdminProfile || !adminProfile.uid || isAiTyping}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity">
              <MessageSquareText className="h-4 w-4" />
            </div>
          </div>
          <Button 
            type="submit" 
            size="icon" 
            className={cn(
              "h-12 w-12 rounded-2xl shadow-lg transition-all duration-200 active:scale-95",
              !newMessage.trim() || isAiTyping ? "opacity-50" : "hover:bg-primary/90"
            )} 
            disabled={!newMessage.trim() || isLoadingMessages || isLoadingGlobalSettings || isLoadingAdminProfile || !adminProfile.uid || isAiTyping}
          >
            {isAiTyping ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5 ml-0.5" />
            )}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
