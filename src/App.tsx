import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { getSreeJiResponse, getSreeJiAudio, resetSreeJiSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import { ambientSoundManager } from "./utils/ambientSounds";

import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User, 
  setPersistence, 
  browserLocalPersistence,
  signOut
} from "firebase/auth";
import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { savePreferences, subscribeToPreferences, UserPreferences } from "./services/preferenceService";

import { getSreeJiErrorFeedback } from "./utils/errorHandlers";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({
    creatorName: "Atharv",
    preferredTitle: "Sir",
    isMuted: false,
    lastUpdated: new Date().toISOString()
  });

  const [ratedMessages, setRatedMessages] = useState<Set<string>>(new Set());

  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  const [isMuted, setIsMuted] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showSreeJiError = (error: any) => {
    const feedback = getSreeJiErrorFeedback(error, preferences.creatorName, preferences.preferredTitle);
    setMessages((prev) => [...prev, { id: Date.now().toString() + "-err", sender: "zoya", text: feedback }]);
  };

  const handleFeedback = async (messageId: string, rating: "up" | "down", responseText: string) => {
    if (!user) return;
    
    // Find the prompt associated with this response (the message before it)
    const messageIndex = messages.findIndex(m => m.id === messageId);
    let userPrompt = "";
    if (messageIndex > 0 && messages[messageIndex - 1].sender === "user") {
      userPrompt = messages[messageIndex - 1].text;
    }

    try {
      await addDoc(collection(db, "feedback"), {
        messageId,
        userId: user.uid,
        rating,
        responseText,
        userPrompt,
        createdAt: new Date().toISOString()
      });
      setRatedMessages(prev => new Set(prev).add(messageId));
    } catch (error) {
      console.error("Failed to submit feedback", error);
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Subscribe to preferences
        const prefUnsubscribe = subscribeToPreferences(u.uid, (prefs) => {
          setPreferences(prefs);
          setIsMuted(prefs.isMuted);
        });
        return prefUnsubscribe;
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    try {
      // Ensuring authentication stays across sessions (Remember Me)
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        // Initial save if first time
        await savePreferences(result.user.uid, {
          creatorName: "Atharv",
          preferredTitle: "Sir"
        });
      }
    } catch (error) {
      console.error("Login failed", error);
      showSreeJiError(error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMessages([]);
      resetSreeJiSession();
    } catch (e) {
      console.error("Logout failed", e);
      showSreeJiError(e);
    }
  };

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("zoya_chat_history", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
    // Save mute preference if user exists
    if (user) {
      savePreferences(user.uid, { isMuted });
    }
  }, [isMuted, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  useEffect(() => {
    ambientSoundManager.setMode(appState);
  }, [appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    try {
      if (!finalTranscript.trim()) {
        setAppState("idle");
        return;
      }

      setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
      
      // If live session is active, send text through it
      if (isSessionActive && liveSessionRef.current) {
        liveSessionRef.current.sendText(finalTranscript);
        return;
      }

      setAppState("processing");

      // 1. Check for browser commands
      const commandResult = processCommand(finalTranscript);

      let responseText = "";

      if (commandResult.isBrowserAction) {
        responseText = commandResult.action;
        setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
        
        if (!isMuted) {
          setAppState("speaking");
          const audioBase64 = await getSreeJiAudio(responseText);
          if (audioBase64) {
            await playPCM(audioBase64);
          }
        }

        setAppState("idle");

        setTimeout(() => {
          if (commandResult.url) {
            window.open(commandResult.url, "_blank");
          }
        }, 1500);
      } else {
        // 2. General Chit-Chat via Gemini
        responseText = await getSreeJiResponse(
          finalTranscript, 
          messagesRef.current,
          preferences.creatorName,
          preferences.preferredTitle
        );
        setMessages((prev) => [...prev, { id: Date.now().toString() + "-zsj", sender: "zoya", text: responseText }]);
        
        if (!isMuted) {
          setAppState("speaking");
          const audioBase64 = await getSreeJiAudio(responseText);
          if (audioBase64) {
            await playPCM(audioBase64);
          }
        }
        setAppState("idle");
      }
    } catch (error) {
      console.error("Text command failed:", error);
      showSreeJiError(error);
      setAppState("idle");
    }
  }, [isMuted, isSessionActive, preferences, showSreeJiError]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetSreeJiSession();
    } else {
      try {
        setIsSessionActive(true);
        resetSreeJiSession();
        
        const session = new LiveSessionManager(preferences.creatorName, preferences.preferredTitle);
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state: AppState) => {
          setAppState(state);
        };
        
        session.onMessage = (sender: "user" | "zoya", text: string) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url: string) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        await session.start();
      } catch (error) {
        console.error("Failed to start session:", error);
        showSreeJiError(error);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center font-bold text-sm">
            S
          </div>
          <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Sree Ji</h1>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-3 mr-2 bg-white/5 pl-3 pr-1 py-1 rounded-full border border-white/10">
               <span className="text-xs text-white/70 hidden md:block font-medium">{preferences.preferredTitle}</span>
               <button 
                 onClick={handleLogout}
                 className="group relative"
                 title="Log Out"
               >
                 {user.photoURL && (
                   <img src={user.photoURL} alt="profile" className="w-7 h-7 rounded-full border border-white/20 hover:opacity-80 transition-opacity" />
                 )}
                 <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 border-2 border-[#050505] rounded-full" title="Stayed Logged In (Remember Me)" />
               </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full border border-white/20 mr-2"
            >
              Log In
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetSreeJiSession();
                }
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Sree Ji Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Replying...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center z-0">
          <Visualizer state={appState} />
          
          {/* Chat History Overlay */}
          <div className="absolute bottom-32 w-full max-w-2xl max-h-[40vh] overflow-y-auto px-6 flex flex-col gap-4 scrollbar-hide pointer-events-auto">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div 
                  className={`
                    max-w-[85%] px-4 py-2 rounded-2xl text-sm md:text-base backdrop-blur-md border animate-in fade-in slide-in-from-bottom-2
                    ${msg.sender === "user" 
                      ? "bg-violet-500/10 border-violet-500/20 text-violet-100 rounded-tr-none" 
                      : "bg-white/5 border-white/10 text-white/90 rounded-tl-none"}
                  `}
                >
                  {msg.text}
                  
                  {msg.sender === "zoya" && !msg.id.includes("-err") && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                      {ratedMessages.has(msg.id) ? (
                        <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Feedback Sent</span>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleFeedback(msg.id, "up", msg.text)}
                            className="p-1 hover:text-green-400 transition-colors text-white/30"
                            title="Helpful"
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button 
                            onClick={() => handleFeedback(msg.id, "down", msg.text)}
                            className="p-1 hover:text-red-400 transition-colors text-white/30"
                            title="Not helpful"
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Sree Ji..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}