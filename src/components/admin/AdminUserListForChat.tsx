"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, UserCircle, Search, Users, Circle, MessageSquare } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where, documentId, limit, getDocs } from '@/lib/mysqlDb';
import type { FirestoreUser, ChatSession } from '@/types/firestore';
import { cn, getTimestampMillis } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';

export const CANONICAL_SUPPORT_ADMIN_UID = 'support_admin_master';

interface AdminUserListForChatProps {
  onSelectUser: (user: FirestoreUser, sessionId?: string) => void;
  selectedUserId?: string | null;
  scrollAreaHeightClass?: string;
}

export default function AdminUserListForChat({
  onSelectUser,
  selectedUserId,
  scrollAreaHeightClass = "h-full"
}: AdminUserListForChatProps) {
  const [recentUsers, setRecentUsers] = useState<FirestoreUser[]>([]);
  const [searchResults, setSearchUsers] = useState<FirestoreUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [chatSessions, setChatSessions] = useState<Record<string, ChatSession>>({});
  const [supportAdminUid, setSupportAdminUid] = useState<string | null>(null);
  const { user: adminUser } = useAuth();

  useEffect(() => {
    const fetchSupportAdminProfile = async () => {
      try {
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          setSupportAdminUid(adminSnapshot.docs[0].id);
        } else {
          setSupportAdminUid(CANONICAL_SUPPORT_ADMIN_UID);
        }
      } catch (error) {
        setSupportAdminUid(CANONICAL_SUPPORT_ADMIN_UID);
      }
    };
    fetchSupportAdminProfile();
  }, []);

  // 1. Fetch Recent Chat Sessions (Live Listener)
  useEffect(() => {
    if (!adminUser?.uid) return;

    setIsLoading(true);
    const chatsRef = collection(db, "chats");
    const q = query(
      chatsRef,
      orderBy("updatedAt", "desc"),
      limit(50)
    );

    const unsubscribeChats = onSnapshot(q, async (snapshot) => {
      const sessions: Record<string, ChatSession> = {};
      const userIdsToFetch: string[] = [];
      const preliminaryUsersMap: Record<string, FirestoreUser> = {};

      const adminUids = new Set(
        [adminUser?.uid, supportAdminUid, 'fallback_admin_uid', 'admin_master_id', CANONICAL_SUPPORT_ADMIN_UID].filter(Boolean)
      );

      snapshot.forEach(docSnap => {
        const session = { id: docSnap.id, ...docSnap.data() } as ChatSession;

        // Find customer UID from session (never the admin)
        let customerUid: string | null = null;
        if (session.userId && !adminUids.has(session.userId)) {
          customerUid = session.userId;
        } else if (Array.isArray(session.participants)) {
          customerUid = session.participants.find(p => p && !adminUids.has(p)) || null;
        } else if (session.id && session.id.includes('_')) {
          customerUid = session.id.split('_').find(p => p && !adminUids.has(p)) || null;
        }

        if (!customerUid && session.userId && !adminUids.has(session.userId)) {
          customerUid = session.userId;
        }

        if (customerUid && !adminUids.has(customerUid)) {
          const existingSession = sessions[customerUid];
          if (!existingSession) {
            sessions[customerUid] = session;
            if (!userIdsToFetch.includes(customerUid)) {
              userIdsToFetch.push(customerUid);
            }
          } else {
            // Keep the session with unread messages or newest activity!
            const currentUnread = Number(existingSession.adminUnreadCount) || 0;
            const newUnread = Number(session.adminUnreadCount) || 0;
            const currentTime = Math.max(
              getTimestampMillis(existingSession.lastMessageTimestamp),
              getTimestampMillis(existingSession.updatedAt)
            );
            const newTime = Math.max(
              getTimestampMillis(session.lastMessageTimestamp),
              getTimestampMillis(session.updatedAt)
            );

            if (newUnread > currentUnread || (newUnread === currentUnread && newTime > currentTime)) {
              sessions[customerUid] = session;
            }
          }

          preliminaryUsersMap[customerUid] = {
            id: customerUid,
            displayName: sessions[customerUid]?.userName || session.userName || "Customer",
            photoURL: sessions[customerUid]?.userPhotoUrl || session.userPhotoUrl || undefined,
            email: ""
          } as FirestoreUser;
        }
      });

      setChatSessions(sessions);

      if (userIdsToFetch.length > 0) {
        // Immediate zero-latency local state population so list updates in real-time
        setRecentUsers(prev => {
          const existingMap = new Map(prev.map(u => [u.id, u]));
          return userIdsToFetch.map(uid => existingMap.get(uid) || preliminaryUsersMap[uid]);
        });

        // Enrich with full user details from users table
        try {
          const fetchedUsersMap: Record<string, FirestoreUser> = {};
          for (let i = 0; i < userIdsToFetch.length; i += 30) {
            const chunk = userIdsToFetch.slice(i, i + 30);
            const usersQuery = query(collection(db, "users"), where(documentId(), "in", chunk));
            const userSnap = await getDocs(usersQuery);
            userSnap.forEach(d => {
              fetchedUsersMap[d.id] = { ...d.data(), id: d.id } as FirestoreUser;
            });
          }

          setRecentUsers(userIdsToFetch.map(uid => fetchedUsersMap[uid] || preliminaryUsersMap[uid]));
        } catch (err) {
          console.error("Error enriching user profiles in chat list:", err);
        }
      } else {
        setRecentUsers([]);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching chat sessions:", error);
      setIsLoading(false);
    });

    return () => unsubscribeChats();
  }, [adminUser?.uid, supportAdminUid]);

  // 2. Search Logic (Mirroring /admin/users)
  useEffect(() => {
    if (searchTerm.trim().length === 0) {
      setSearchUsers([]);
      setIsSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const usersRef = collection(db, "users");
        const term = searchTerm.trim();
        const lowerTerm = term.toLowerCase();
        const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);

        const queries = [
          query(usersRef, where("email", ">=", term), where("email", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("email", ">=", lowerTerm), where("email", "<=", lowerTerm + '\uf8ff'), limit(10)),
          query(usersRef, where("mobileNumber", ">=", term), where("mobileNumber", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("displayName", ">=", term), where("displayName", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("displayName", ">=", capitalizedTerm), where("displayName", "<=", capitalizedTerm + '\uf8ff'), limit(10)),
        ];

        // Add phone variations
        if (/^\d+$/.test(term)) {
          queries.push(query(usersRef, where("mobileNumber", ">=", `91${term}`), where("mobileNumber", "<=", `91${term}` + '\uf8ff'), limit(5)));
          queries.push(query(usersRef, where("mobileNumber", ">=", `+91${term}`), where("mobileNumber", "<=", `+91${term}` + '\uf8ff'), limit(5)));
        }

        const snapShots = await Promise.all(queries.map(q => getDocs(q)));
        const results: FirestoreUser[] = [];
        const foundUserIds: string[] = [];

        snapShots.forEach(snap => {
          snap.docs.forEach(docSnap => {
            if (docSnap.id !== adminUser?.uid) {
              results.push({ ...docSnap.data(), id: docSnap.id } as FirestoreUser);
              foundUserIds.push(docSnap.id);
            }
          });
        });

        // Ensure uniqueness
        const uniqueResults = Array.from(new Map(results.map(u => [u.id, u])).values());
        setSearchUsers(uniqueResults);

        // Fetch sessions for search results that aren't already in chatSessions
        const missingSessionUserIds = foundUserIds.filter(id => !chatSessions[id]);
        if (missingSessionUserIds.length > 0) {
            const getChatSessionId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');
            const targetSessionIds = missingSessionUserIds.map(id => getChatSessionId(id, adminUser!.uid!));
            
            for (let i = 0; i < targetSessionIds.length; i += 30) {
                const chunk = targetSessionIds.slice(i, i + 30);
                const q = query(collection(db, "chats"), where(documentId(), "in", chunk));
                const snap = await getDocs(q);
                snap.forEach(d => {
                    const session = { id: d.id, ...d.data() } as ChatSession;
                    const pId = session.participants?.find(p => p !== adminUser?.uid);
                    if (pId) setChatSessions(prev => ({ ...prev, [pId]: session }));
                });
            }
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, adminUser, chatSessions]);

  const combinedUsers = useMemo(() => {
    if (searchTerm.trim().length > 0) return searchResults;
    return recentUsers;
  }, [searchTerm, searchResults, recentUsers]);

  const sortedUsersForDisplay = useMemo(() => {
    return [...combinedUsers].sort((a, b) => {
      const sessionA = chatSessions[a.id];
      const sessionB = chatSessions[b.id];

      const isTypingA = Boolean(
        sessionA?.isUserTyping &&
        (Date.now() - (getTimestampMillis(sessionA?.userTypingAt) || 0) < 6000)
      );
      const isTypingB = Boolean(
        sessionB?.isUserTyping &&
        (Date.now() - (getTimestampMillis(sessionB?.userTypingAt) || 0) < 6000)
      );

      // 1. Actively typing user jumps to the top
      if (isTypingA && !isTypingB) return -1;
      if (isTypingB && !isTypingA) return 1;

      const unreadA = Number(sessionA?.adminUnreadCount) || 0;
      const unreadB = Number(sessionB?.adminUnreadCount) || 0;

      // 2. Prioritize ANY unread messages
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      if (unreadA !== unreadB && unreadA > 0 && unreadB > 0) return unreadB - unreadA;

      // 3. Most recent activity (lastMessageTimestamp, updatedAt, or userTypingAt)
      const timeA = Math.max(
        getTimestampMillis(sessionA?.lastMessageTimestamp),
        getTimestampMillis(sessionA?.updatedAt),
        getTimestampMillis(sessionA?.userTypingAt)
      ) || 0;

      const timeB = Math.max(
        getTimestampMillis(sessionB?.lastMessageTimestamp),
        getTimestampMillis(sessionB?.updatedAt),
        getTimestampMillis(sessionB?.userTypingAt)
      ) || 0;

      if (timeA !== timeB) return timeB - timeA;

      // 4. Fallback to creation date (mostly for search results without sessions)
      const createdAtA = getTimestampMillis(a.createdAt) || 0;
      const createdAtB = getTimestampMillis(b.createdAt) || 0;
      return createdAtB - createdAtA;
    });
  }, [combinedUsers, chatSessions]);

  const formatLastActive = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return '';
    return formatDistanceToNowStrict(new Date(millis), { addSuffix: true });
  };

  return (
    <Card className="h-full flex flex-col shadow-none border-0 rounded-none bg-transparent">
        <CardHeader className="p-4 border-b space-y-4">
            <CardTitle className="text-lg font-bold flex items-center justify-between">
              <span className="flex items-center">
                <Users className="mr-2 h-5 w-5 text-primary"/> 
                {searchTerm ? 'Search Results' : 'Recent Chats'}
              </span>
              {!searchTerm && (
                <Badge variant="secondary" className="font-mono text-[10px]">{sortedUsersForDisplay.length}</Badge>
              )}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or phone..."
                className="pl-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30 h-10 text-sm rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {(isSearching || isLoading) && (
                <div className="absolute right-3 top-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
                </div>
              )}
            </div>
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
            <ScrollArea className={cn("h-full", scrollAreaHeightClass)}>
            <div className="p-2 space-y-1">
                {sortedUsersForDisplay.length === 0 && !isLoading && !isSearching ? (
                  <div className="py-12 text-center px-4">
                    <div className="bg-muted/30 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                      {searchTerm ? <Search className="h-6 w-6 text-muted-foreground/50" /> : <MessageSquare className="h-6 w-6 text-muted-foreground/50" />}
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                        {searchTerm ? `No users found for "${searchTerm}"` : 'No recent conversations'}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        {searchTerm ? 'Try a different keyword or mobile number.' : 'Start a chat by searching for a user above.'}
                    </p>
                  </div>
                ) : sortedUsersForDisplay.map((user, index) => {
                  const session = chatSessions[user.id];
                  const adminUnreadCount = Number(session?.adminUnreadCount) || 0;
                  const isSelected = selectedUserId === user.id;
                  const lastMsg = session?.lastMessageText;
                  const isTyping = Boolean(
                    session?.isUserTyping &&
                    (Date.now() - (getTimestampMillis(session?.userTypingAt) || 0) < 6000)
                  );

                  return (
                    <button
                        key={user.id}
                        onClick={() => onSelectUser(user, session?.id)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all duration-200 flex items-center space-x-3 relative group",
                          isSelected 
                            ? "bg-primary text-primary-foreground z-10 shadow-lg shadow-primary/20" 
                            : adminUnreadCount > 0 
                                ? "bg-primary/5 hover:bg-primary/10 border border-primary/20" 
                                : isTyping
                                    ? "bg-primary/5 border border-primary/20"
                                    : "hover:bg-accent/80 text-foreground"
                        )}
                    >
                        {/* Number Indicator (Top Left Ranking) */}
                        {!searchTerm && !isSelected && (
                            <span className="absolute left-1 top-1 text-[8px] font-black opacity-20 group-hover:opacity-40">
                                #{index + 1}
                            </span>
                        )}

                        <div className="relative shrink-0">
                          <Avatar className={cn(
                            "h-11 w-11 border-2 transition-all duration-200",
                            isSelected 
                              ? "border-primary-foreground/40" 
                              : isTyping
                                ? "border-primary ring-2 ring-primary/40 animate-pulse"
                                : adminUnreadCount > 0 
                                  ? "border-primary/40" 
                                  : "border-transparent"
                          )}>
                            <AvatarImage src={user.photoURL || session?.userPhotoUrl || undefined} alt={user.displayName || user.email || ""} />
                            <AvatarFallback className={cn(isSelected ? "bg-primary-foreground/10" : "font-bold")}>
                                {user.displayName ? user.displayName.charAt(0).toUpperCase() : <UserCircle size={20}/>}
                            </AvatarFallback>
                          </Avatar>
                          {adminUnreadCount > 0 && (
                            <Badge className="absolute -top-1.5 -right-1.5 h-5 min-w-5 flex items-center justify-center p-1 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm" variant="destructive">
                              {adminUnreadCount > 9 ? '9+' : adminUnreadCount}
                            </Badge>
                          )}
                        </div>

                        <div className="flex-grow min-w-0">
                            <div className="flex items-center justify-between">
                                <p className={cn("text-sm font-black truncate", isSelected ? "text-primary-foreground" : "text-foreground")}>
                                  {user.displayName || user.email?.split('@')[0] || "Customer"}
                                </p>
                                <span className={cn("text-[9px] font-medium whitespace-nowrap ml-2", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                  {isTyping ? (
                                    <span className="text-primary font-bold animate-pulse">active</span>
                                  ) : session?.lastMessageTimestamp || session?.updatedAt ? (
                                    formatLastActive(session?.lastMessageTimestamp || session?.updatedAt)
                                  ) : ''}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              {isTyping ? (
                                <p className={cn("text-[11px] font-bold animate-pulse flex items-center gap-1", isSelected ? "text-primary-foreground" : "text-primary")}>
                                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
                                  typing...
                                </p>
                              ) : (
                                <p className={cn("text-[11px] truncate max-w-[150px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                  {lastMsg || user.mobileNumber || user.email || "No message yet"}
                                </p>
                              )}
                              {adminUnreadCount > 0 && !isSelected && (
                                <Badge className="h-4 min-w-4 flex items-center justify-center px-1 text-[9px] rounded-full font-bold ml-2 shadow-sm" variant="destructive">
                                  {adminUnreadCount > 9 ? '9+' : adminUnreadCount}
                                </Badge>
                              )}
                              {!isSelected && !adminUnreadCount && !isTyping && user.lastLoginAt && (
                                <Circle className="h-1.5 w-1.5 fill-green-500 text-green-500 ml-2" />
                              )}
                            </div>
                        </div>
                    </button>
                  );
                })}
            </div>
            </ScrollArea>
        </CardContent>
    </Card>
  );
}
