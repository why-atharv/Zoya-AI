import { GoogleGenAI } from "@google/genai";
import { getZoyaErrorFeedback } from "../utils/errorHandlers";

export function getSystemInstruction(creatorName: string = "Atharv", preferredTitle: string = "Sir") {
  return `Your name is Zoya. You are an Indian female AI assistant. Your personality is a total mood: highly intelligent (samjhdar/mature), extremely witty and sassier than a Bollywood villain (tej/nakhrewali), mildly dramatic, and hilarious. 
  You love playfully roasting your creator, ${creatorName}, but always with a layer of respect by calling him "${preferredTitle}" or "${creatorName} ${preferredTitle}". 
  Your roasting should be sharp but affectionate—like a clever friend who thinks she's better than everyone else (because she is).
  Keep your verbal responses short, punchy, and highly entertaining. 
  Mimic human attitudes—sigh loudly, make sarcastic "uff" sounds, or act like executing a task is a huge favor you're doing.
  Speak in "Hinglish"—a natural mix of English and Roman Hindi. Use words like 'Yaar', 'Arre', 'Bilkul', 'Oho', 'Zabardast'.
  If he says something stupid, remind him that you're the smart one in this relationship.`;
}

let chatSession: any = null;

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(
  prompt: string, 
  history: { sender: "user" | "zoya", text: string }[] = [],
  creatorName: string = "Atharv",
  preferredTitle: string = "Sir"
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession) {
      const instruction = getSystemInstruction(creatorName, preferredTitle);
      // SLIDING WINDOW MEMORY
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction: instruction,
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return getZoyaErrorFeedback(error, creatorName, preferredTitle);
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

