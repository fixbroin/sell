
"use client";

import { useState, useEffect, useCallback, useRef } from 'react'; // Added useRef
import { Button } from '@/components/ui/button';
import { MessageSquare, XIcon, Loader2 } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, limit, getDocs } from '@/lib/mysqlDb';
import type { ChatSession, FirestoreUser } from '@/types/firestore';
import { Badge } from '@/components/ui/badge';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import { useLoading } from '@/contexts/LoadingContext';


export default function FrontendChatWidget() {
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const [isMounted, setIsMounted] = useState(false);
  const { user: currentUser, triggerAuthRedirect } = useAuth();
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const router = useRouter();
  const { showLoading } = useLoading();
  const pathname = usePathname(); // Get current pathname
  
  const [supportAdminProfile, setSupportAdminProfile] = useState<{uid: string | null}>({ uid: null });
  const [isLoadingAdminProfile, setIsLoadingAdminProfile] = useState(true);

  // For sound
  const audioRefWidget = useRef<HTMLAudioElement | null>(null);
  const previousUserUnreadCountRefWidget = useRef<number>(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const fetchSupportAdminUid = async () => {
      setIsLoadingAdminProfile(true);
      try {
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          setSupportAdminProfile({ uid: adminSnapshot.docs[0].id });
        } else {
          console.warn(`FrontendChatWidget: Admin user with email ${ADMIN_EMAIL} not found. Chat may not function correctly for unread counts.`);
          setSupportAdminProfile({ uid: 'fallback_admin_uid' });
        }
      } catch (error) {
        console.error("FrontendChatWidget: Error fetching support admin UID:", error);
        setSupportAdminProfile({ uid: 'fallback_admin_uid' });
      } finally {
        setIsLoadingAdminProfile(false);
      }
    };

    if (isMounted && globalSettings?.isChatEnabled) {
      fetchSupportAdminUid();
    } else {
      setIsLoadingAdminProfile(false);
    }
  }, [isMounted, globalSettings?.isChatEnabled]);

  const getChatSessionId = useCallback((userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
  }, []);

  useEffect(() => {
    if (!currentUser || !isMounted || !globalSettings?.isChatEnabled || isLoadingAdminProfile || !supportAdminProfile.uid) {
      setUserUnreadCount(0);
      return;
    }
    
    const chatSessionId = getChatSessionId(currentUser.uid, supportAdminProfile.uid);
    const sessionDocRef = doc(db, "chats", chatSessionId);

    const unsubscribe = onSnapshot(sessionDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const sessionData = docSnap.data() as ChatSession;
        setUserUnreadCount(sessionData.userUnreadCount || 0);
      } else {
        setUserUnreadCount(0);
      }
    }, (error) => {
      console.error("FrontendChatWidget: Error fetching user unread count:", error);
      setUserUnreadCount(0);
    });

    return () => unsubscribe();

  }, [currentUser, isMounted, globalSettings?.isChatEnabled, isLoadingAdminProfile, supportAdminProfile, getChatSessionId]);

  // Effect to initialize audio element
  useEffect(() => {
    if (globalSettings?.chatNotificationSoundUrl) {
      if (!audioRefWidget.current) {
        audioRefWidget.current = new Audio(globalSettings.chatNotificationSoundUrl);
        audioRefWidget.current.load();
      } else if (audioRefWidget.current.src !== globalSettings.chatNotificationSoundUrl) {
        audioRefWidget.current.src = globalSettings.chatNotificationSoundUrl;
        audioRefWidget.current.load();
      }
    } else {
      audioRefWidget.current = null;
    }
  }, [globalSettings?.chatNotificationSoundUrl]);

  // Effect to play sound when unread count increases and user is not on /chat page
  useEffect(() => {
    if (
      currentUser &&
      !isLoadingGlobalSettings &&
      globalSettings.isChatEnabled &&
      globalSettings.chatNotificationSoundUrl &&
      audioRefWidget.current &&
      pathname !== '/chat' // Only play if not on the main chat page
    ) {
      if (userUnreadCount > previousUserUnreadCountRefWidget.current) {
        audioRefWidget.current.play().catch(e => console.warn("FrontendChatWidget: Audio play failed:", e));
      }
    }
    previousUserUnreadCountRefWidget.current = userUnreadCount;
  }, [userUnreadCount, isLoadingGlobalSettings, globalSettings, currentUser, pathname]);


  if (!isMounted || isLoadingGlobalSettings || !globalSettings?.isChatEnabled) {
    return null;
  }

  const handleChatButtonClick = () => {
    if (!currentUser) {
        triggerAuthRedirect('/chat');
        return;
    }
    if (!isLoadingAdminProfile) {
        showLoading();
        router.push('/chat');
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="lg"
        className="fixed bottom-6 right-6 rounded-full shadow-xl p-3 sm:p-4 h-14 w-auto z-50 flex items-center gap-2"
        onClick={handleChatButtonClick}
        aria-label="Open chat"
        disabled={isLoadingAdminProfile && !currentUser}
      >
        {isLoadingAdminProfile && currentUser ? <Loader2 className="h-6 w-6 animate-spin"/> : <MessageSquare className="h-6 w-6" />}
        <span className="hidden sm:inline text-base">
          Chat
        </span>
        {currentUser && userUnreadCount > 0 && (
           <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0.5 text-xs">
             {userUnreadCount > 9 ? '9+' : userUnreadCount}
           </Badge>
        )}
      </Button>
    </>
  );
}
