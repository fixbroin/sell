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

interface AdminUserListForChatProps {
  onSelectUser: (user: FirestoreUser) => void;
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
  const { user: adminUser } = useAuth();

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

      snapshot.forEach(docSnap => {
        const session = { id: docSnap.id, ...docSnap.data() } as ChatSession;
        const participantUserId = session.userId || session.participants?.find(pId => pId !== adminUser?.uid);
        if (participantUserId) {
          sessions[participantUserId] = session;
          if (!userIdsToFetch.includes(participantUserId)) {
            userIdsToFetch.push(participantUserId);
          }
        }
      });

      setChatSessions(sessions);

      if (userIdsToFetch.length > 0) {
        // Fetch user profiles for these IDs in chunks of 30
        const fetchedUsersMap: Record<string, FirestoreUser> = {};
        for (let i = 0; i < userIdsToFetch.length; i += 30) {
          const chunk = userIdsToFetch.slice(i, i + 30);
          const usersQuery = query(collection(db, "users"), where(documentId(), "in", chunk));
          const userSnap = await getDocs(usersQuery);
          userSnap.forEach(d => {
            fetchedUsersMap[d.id] = { ...d.data(), id: d.id } as FirestoreUser;
          });
        }
        
        // Sort users by the latest message / update timestamp of their chat session (newest at the top)
        const sortedUsers = userIdsToFetch
          .map(uid => fetchedUsersMap[uid] || { id: uid, displayName: sessions[uid]?.userName || "User", email: "" } as FirestoreUser)
          .sort((a, b) => {
            const timeA = getTimestampMillis(sessions[a.id]?.updatedAt || sessions[a.id]?.lastMessageTimestamp);
            const timeB = getTimestampMillis(sessions[b.id]?.updatedAt || sessions[b.id]?.lastMessageTimestamp);
            return timeB - timeA;
          });

        setRecentUsers(sortedUsers);
      } else {
        setRecentUsers([]);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching chat sessions:", error);
      setIsLoading(false);
    });

    return () => unsubscribeChats();
  }, [adminUser?.uid]);

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

      const unreadA = sessionA?.adminUnreadCount || 0;
      const unreadB = sessionB?.adminUnreadCount || 0;

      // 1. Prioritize ANY unread messages
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      
      // 2. If both have unread, or both have 0, sort by last message timestamp
      const timeA = getTimestampMillis(sessionA?.lastMessageTimestamp) || 0;
      const timeB = getTimestampMillis(sessionB?.lastMessageTimestamp) || 0;

      if (timeA !== timeB) return timeB - timeA;
      
      // 3. Fallback to creation date (mostly for search results without sessions)
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
                  const adminUnreadCount = session?.adminUnreadCount || 0;
                  const isSelected = selectedUserId === user.id;
                  const lastMsg = session?.lastMessageText;

                  return (
                    <button
                        key={user.id}
                        onClick={() => onSelectUser(user)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all duration-200 flex items-center space-x-3 relative group",
                          isSelected 
                            ? "bg-primary text-primary-foreground z-10 shadow-lg shadow-primary/20" 
                            : adminUnreadCount > 0 
                                ? "bg-primary/5 hover:bg-primary/10 border border-primary/10" 
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
                            isSelected ? "border-primary-foreground/40" : adminUnreadCount > 0 ? "border-primary/30" : "border-transparent"
                          )}>
                            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || ""} />
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
                                  {user.displayName || user.email?.split('@')[0]}
                                </p>
                                <span className={cn("text-[9px] font-medium whitespace-nowrap ml-2", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                  {session?.lastMessageTimestamp ? formatLastActive(session.lastMessageTimestamp) : ''}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <p className={cn("text-[11px] truncate max-w-[150px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                {lastMsg || user.mobileNumber || user.email}
                              </p>
                              {adminUnreadCount > 0 && !isSelected && (
                                <div className="h-2 w-2 rounded-full bg-primary animate-pulse ml-2" />
                              )}
                              {!isSelected && !adminUnreadCount && user.lastLoginAt && (
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
